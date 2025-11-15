;(function () {
  var statusEl = document.getElementById('status')
  var keysEl = document.getElementById('keys')
  var feedEl = document.getElementById('feed')
  var composeTextEl = document.getElementById('compose-text')
  var composeSendEl = document.getElementById('compose-send')

  var currentKeys = null
  var currentFeedId = null
  var signKeyPromise = null
  var feedState = {}

  function setStatus (msg) {
    if (statusEl) statusEl.textContent = msg
  }

  function setKeys (obj) {
    if (!keysEl) return
    keysEl.textContent = JSON.stringify(obj, null, 2)
  }

  function clearFeed () {
    if (!feedEl) return
    while (feedEl.firstChild) feedEl.removeChild(feedEl.firstChild)
  }

  function loadKeys () {
    try {
      var raw = localStorage.getItem('ssb_browser_keys')
      if (!raw) return null
      return JSON.parse(raw)
    } catch (err) {
      console.error('failed to parse stored keys', err)
      return null
    }
  }

  function saveKeys (keys) {
    try {
      localStorage.setItem('ssb_browser_keys', JSON.stringify(keys))
    } catch (err) {
      console.error('failed to persist keys', err)
    }
  }

  function toBase64 (arr) {
    var s = ''
    for (var i = 0; i < arr.length; i++) {
      s += String.fromCharCode(arr[i])
    }
    return btoa(s)
  }

  function fromBase64 (str) {
    var bin = atob(str)
    var len = bin.length
    var arr = new Uint8Array(len)
    for (var i = 0; i < len; i++) {
      arr[i] = bin.charCodeAt(i)
    }
    return arr
  }

  function generateKeysWithWebCrypto () {
    if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.generateKey) {
      return Promise.reject(new Error('WebCrypto Ed25519 not available'))
    }

    // This assumes a modern browser with Ed25519 in SubtleCrypto.
    // You may need to adjust algorithm name depending on engine.
    return window.crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    ).then(function (keyPair) {
      return Promise.all([
        window.crypto.subtle.exportKey('raw', keyPair.publicKey),
        window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
      ]).then(function (exported) {
        var pub = new Uint8Array(exported[0])
        var priv = new Uint8Array(exported[1])

        // These are raw Ed25519 key bytes (pub) and PKCS#8 (priv), base64-encoded.
        return {
          curve: 'ed25519',
          public: toBase64(pub),
          private: toBase64(priv)
        }
      })
    })
  }

  function ensureKeys () {
    var existing = loadKeys()
    if (existing && existing.public && existing.private) {
      setStatus('Loaded existing keys from localStorage')
      setKeys(existing)
      currentKeys = existing
      currentFeedId = '@' + existing.public + '.ed25519'
      return ensureSignKey(existing).then(function () {
        return existing
      })
    }

    setStatus('Generating new keypair in browser…')
    return generateKeysWithWebCrypto().then(function (keys) {
      saveKeys(keys)
      setStatus('Generated and stored new keypair')
      setKeys(keys)
      currentKeys = keys
      currentFeedId = '@' + keys.public + '.ed25519'
      return ensureSignKey(keys).then(function () {
        return keys
      })
    }).catch(function (err) {
      console.error('failed to generate keys', err)
      setStatus('Failed to generate keys: ' + err.message)
      setKeys({})
      return null
    })
  }

  function ensureSignKey (keys) {
    if (signKeyPromise) return signKeyPromise
    if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.importKey) {
      return Promise.reject(new Error('WebCrypto Ed25519 not available'))
    }

    var privB64 = keys.private
    var pkcs8 = fromBase64(privB64).buffer

    signKeyPromise = window.crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'Ed25519' },
      false,
      ['sign']
    )

    return signKeyPromise
  }

  function loadLog () {
    setStatus('Keys ready; loading log…')

    fetch('/log.json')
      .then(function (res) { return res.json() })
      .then(function (msgs) {
        if (!Array.isArray(msgs)) msgs = []
        feedState = {}
        clearFeed()

        // messages are newest-first (reverse: true), so first seen is latest
        msgs.forEach(function (msg) {
          var value = msg && msg.value
          var author = value && value.author
          if (!author) return
          if (!feedState[author]) {
            feedState[author] = {
              id: msg.key,
              sequence: value.sequence,
              timestamp: value.timestamp
            }
          }

          if (!feedEl || !value || !value.content) return

          var text = value.content && value.content.text
          var type = value.content && value.content.type
          var ts = value.timestamp
          var date = ts ? new Date(ts).toISOString() : ''

          var postDiv = document.createElement('div')
          postDiv.className = 'post'

          var metaDiv = document.createElement('div')
          metaDiv.className = 'post-meta'
          metaDiv.textContent = (type || 'message') + ' · ' + (author || '') + (date ? ' · ' + date : '')

          var textDiv = document.createElement('div')
          textDiv.className = 'post-text'
          textDiv.textContent = text || JSON.stringify(value.content)

          postDiv.appendChild(metaDiv)
          postDiv.appendChild(textDiv)
          feedEl.appendChild(postDiv)
        })
        setStatus('Keys ready; log loaded')
      })
      .catch(function (err) {
        console.error('failed to load log', err)
        clearFeed()
        if (feedEl) {
          var errDiv = document.createElement('div')
          errDiv.className = 'post'
          errDiv.textContent = 'failed to load log: ' + err.message
          feedEl.appendChild(errDiv)
        }
        setStatus('Keys ready; failed to load log')
      })
  }

  function signMessage (unsignedMsg) {
    return ensureSignKey(currentKeys).then(function (key) {
      var json = JSON.stringify(unsignedMsg, null, 2)
      var encoder = new TextEncoder()
      var bytes = encoder.encode(json)
      return window.crypto.subtle.sign(
        { name: 'Ed25519' },
        key,
        bytes
      ).then(function (sigBuf) {
        var sigBytes = new Uint8Array(sigBuf)
        var sigB64 = toBase64(sigBytes)
        return sigB64 + '.sig.ed25519'
      })
    })
  }

  function buildUnsignedMessage (text) {
    if (!currentKeys || !currentFeedId) {
      throw new Error('Browser keys not ready')
    }

    var state = feedState[currentFeedId] || null
    var ts = Date.now()
    if (state && ts <= state.timestamp) ts = state.timestamp + 1

    return {
      previous: state ? state.id : null,
      sequence: state ? state.sequence + 1 : 1,
      author: currentFeedId,
      timestamp: ts,
      hash: 'sha256',
      content: {
        type: 'post',
        text: text
      }
    }
  }

  function publishFromBrowser (text) {
    var unsigned = buildUnsignedMessage(text)

    return signMessage(unsigned).then(function (sig) {
      var msg = {
        previous: unsigned.previous,
        sequence: unsigned.sequence,
        author: unsigned.author,
        timestamp: unsigned.timestamp,
        hash: unsigned.hash,
        content: unsigned.content,
        signature: sig
      }

      return fetch('/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ msg: msg })
      }).then(function (res) {
        return res.json()
      }).then(function (saved) {
        return saved
      })
    })
  }

  function wireCompose () {
    if (!composeSendEl || !composeTextEl) return

    composeSendEl.addEventListener('click', function () {
      var text = composeTextEl.value
      if (!text) return

      composeSendEl.disabled = true
      setStatus('Publishing post…')

      publishFromBrowser(text)
        .then(function (msg) {
          composeTextEl.value = ''
          setStatus('Post published; refreshing log…')
          loadLog()
        })
        .catch(function (err) {
          console.error('failed to publish', err)
          setStatus('Failed to publish: ' + err.message)
        })
        .then(function () {
          composeSendEl.disabled = false
        })
    })
  }

  // Entry point
  ensureKeys().then(function () {
    loadLog()
    wireCompose()
    // TODO: wire these keys into a browserified ssb-client
    // that connects to the ssb-ws endpoint exposed by ssb-server.
  })
})()
