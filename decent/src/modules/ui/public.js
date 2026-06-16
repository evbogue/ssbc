var h = require('hyperscript')
var pull = require('pull-stream')
var Scroller = require('../../scroller')
var keys = require('../../keys')
var emptyState = require('../../empty-state')

//var plugs = require('../../wire')
//var message_render = plugs.first(exports.message_render = [])
//var message_compose = plugs.first(exports.message_compose = [])
//var sbot_log = plugs.first(exports.sbot_log = [])

exports.needs = {
  message_render: 'first',
  message_compose: 'first',
  sbot_messagesByType: 'first',
  sbot_log: 'first',
  avatar_image: 'first',
  avatar_name: 'first'
}

exports.gives = {
  builtin_tabs: true, screen_view: true
}

exports.create = function (api) {
  function isSsbskiSkin () {
    return !!document.querySelector('link[rel="stylesheet"][href*="ssbski-style.css"]')
  }

  function isPublicMessage (msg) {
    var value = msg && msg.value
    var content = value && value.content
    if (!value || !content || typeof content !== 'object') return false
    if (value.private || content.private || Array.isArray(content.recps)) return false
    return true
  }

  function isFollowMessage (msg) {
    var value = msg && msg.value
    var content = value && value.content
    return content &&
      content.type === 'contact' &&
      value.author === keys.id &&
      typeof content.contact === 'string'
  }

  function isVisiblePublicMessage (msg, authors) {
    if (!isPublicMessage(msg)) return false
    var value = msg.value
    return !!authors[value.author]
  }

  // An encrypted message is detected purely structurally: its content is a
  // boxed string, not an object. We NEVER unbox here — Discover must not
  // decrypt anything, not even to test whether it's addressed to us.
  function isEncryptedMessage (msg) {
    var value = msg && msg.value
    return !!(value && typeof value.content === 'string')
  }

  var SHOW_ENC_KEY = 'ssbski:show-encrypted'
  function getShowEncrypted () {
    try { return window.localStorage.getItem(SHOW_ENC_KEY) === '1' }
    catch (e) { return false }
  }
  function setShowEncrypted (on) {
    try { window.localStorage.setItem(SHOW_ENC_KEY, on ? '1' : '0') } catch (e) {}
  }

  // A locked card for an encrypted message we can't (and don't try to) read.
  // Only the public envelope — author, sequence, the ciphertext itself — is
  // shown; recps live inside the boxed content and stay hidden. The raw view
  // shows the encrypted blob ONLY (no decrypt), unlike the Chat raw view.
  function renderEncryptedCard (msg) {
    var author = msg.value.author
    var rawPre = null
    var showing = false

    var rawBtn = h('button.action-btn.action-btn--raw',
      {type: 'button', title: 'View encrypted blob', 'aria-label': 'View encrypted blob'},
      h('span.material-symbols-outlined.action-icon', {'aria-hidden': 'true'}, 'data_object'))

    var card = h('div.message.message-card.encrypted-card',
      h('div.title.row',
        h('a.encrypted-card__who', {href: '#' + author},
          h('div.avatar', api.avatar_image(author, 'thumbnail')),
          h('span.encrypted-card__name', api.avatar_name(author))
        ),
        h('span.encrypted-card__raw', rawBtn)
      ),
      h('div.encrypted-card__body',
        h('span.material-symbols-outlined.encrypted-card__lock', {'aria-hidden': 'true'}, 'lock'),
        h('span.encrypted-card__text', 'Encrypted message — addressed to someone, sealed to you')
      )
    )

    rawBtn.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      showing = !showing
      if (showing) {
        if (!rawPre) rawPre = h('pre.encrypted-card__rawjson',
          h('code', JSON.stringify({key: msg.key, value: msg.value}, null, 2)))
        card.appendChild(rawPre)
        rawBtn.classList.add('action-btn--raw-on')
      } else {
        if (rawPre && rawPre.parentNode === card) card.removeChild(rawPre)
        rawBtn.classList.remove('action-btn--raw-on')
      }
      rawBtn.title = showing ? 'Hide encrypted blob' : 'View encrypted blob'
      rawBtn.setAttribute('aria-label', rawBtn.title)
    })

    return card
  }

  function applyFollowState (authors, msg) {
    if (!isFollowMessage(msg)) return

    var content = msg.value.content
    if (content.blocking || content.following === false) delete authors[content.contact]
    else if (content.following === true) authors[content.contact] = true
  }

  function loadAuthors (cb) {
    pull(
      api.sbot_messagesByType({type: 'contact', old: true, live: false}),
      pull.collect(function (err, contacts) {
        if (err) return cb(err)

        var authors = {}
        authors[keys.id] = true

        ;(contacts || []).forEach(function (msg) {
          applyFollowState(authors, msg)
        })

        cb(null, authors)
      })
    )
  }

  return {
    builtin_tabs: function () {
      return ['public', 'friends']
    },

    screen_view: function (path, sbot) {
      if(path === 'public' || path === 'friends') {
        var isSsbski = isSsbskiSkin()
        var publicLabel = isSsbski ? 'Discover' : 'Public'
        var friendsLabel = isSsbski ? 'Following' : 'Friends'
        var autoOpen = false
        var initialQuote = null
        if (path === 'public') {
          try {
            initialQuote = window.sessionStorage.getItem('decent_quote_intent')
            autoOpen = !!initialQuote
            if (initialQuote) window.sessionStorage.removeItem('decent_quote_intent')
          } catch (err) {}
        }

        var content = h('div.column.scroller__content')
        var div = h('div.column.scroller',
          {style: {'overflow':'auto'}},
          h('div.scroller__wrapper',
            api.message_compose(
              {type: 'post'},
              {
                placeholder: 'Write a public message',
                modal: true,
                inline: true,
                promptText: path === 'friends'
                  ? (isSsbski ? 'Post to Following...' : 'Write to your friends…')
                  : (isSsbski ? 'What is happening?' : 'Write a public message…'),
                triggerLabel: 'Compose',
                listenReplyEvents: true,
                autoOpen: autoOpen,
                initialQuote: initialQuote
              }
            ),
            content
          )
        )
        div.setAttribute('data-icon', 'key')
        div.title = path === 'friends' ? friendsLabel : publicLabel

        function setEmptyState () {
          emptyState(content, path === 'friends'
            ? { icon: 'group', title: 'Your ' + friendsLabel + ' feed is empty',
                body: 'Follow some accounts and their posts will show up here.' }
            : { icon: 'tag', title: 'Nothing here yet',
                body: 'Posts from across the network will show up here.' })
        }
        setEmptyState()

        // Render an item: a normal post card, or — only on Discover with the
        // toggle on — a locked card for an encrypted message. The locked path
        // never decrypts.
        function renderItem (msg) {
          if (path === 'public' && getShowEncrypted() && isEncryptedMessage(msg))
            return renderEncryptedCard(msg)
          return api.message_render(msg)
        }

        // Generation token so re-rendering (when the encrypted toggle flips)
        // aborts the previous streams instead of stacking duplicate live feeds.
        var feedGen = 0

        function renderFeed(authors) {
          var myGen = ++feedGen
          var showEnc = path === 'public' && getShowEncrypted()
          var filter = path === 'friends'
            ? function (msg) { return isVisiblePublicMessage(msg, authors) }
            : function (msg) {
                return isPublicMessage(msg) || (showEnc && isEncryptedMessage(msg))
              }
          var alive = function () { return myGen === feedGen }

          content.innerHTML = ''
          setEmptyState()

          pull(
            api.sbot_log({
              reverse: true,
              limit: 100,
              live: false,
              old: true
            }),
            pull.filter(filter),
            pull.take(alive),
            Scroller(div, content, renderItem, false, false)
          )

          pull(
            api.sbot_log({
              old: false,
              live: true
            }),
            pull.filter(filter),
            pull.take(alive),
            Scroller(div, content, renderItem, true, false)
          )
        }

        // Discover-only: a default-off switch to interleave encrypted traffic
        // as locked cards. Flipping it re-renders the feed (old streams abort
        // via the generation token above).
        if (path === 'public' && isSsbski) {
          var encCheckbox = h('input', {type: 'checkbox', checked: getShowEncrypted()})
          encCheckbox.addEventListener('change', function () {
            setShowEncrypted(encCheckbox.checked)
            renderFeed()
          })
          var encToggle = h('label.encrypted-toggle',
            encCheckbox,
            h('span.material-symbols-outlined.encrypted-toggle__icon', {'aria-hidden': 'true'}, 'lock'),
            h('span', 'Show encrypted traffic')
          )
          div.querySelector('.scroller__wrapper').insertBefore(encToggle, content)
        }

        if (path === 'public') {
          renderFeed()
          return div
        }

        loadAuthors(function (err, authors) {
          if (err) {
            content.appendChild(h('div.message.message-card',
              h('div.column', h('strong', 'Unable to load friends feed'))
            ))
            console.error(err)
            return
          }

          pull(
            api.sbot_messagesByType({
              type: 'contact',
              old: false,
              live: true
            }),
            pull.drain(function (msg) {
              applyFollowState(authors, msg)
            }, function (streamErr) {
              if (streamErr && streamErr !== true) console.error(streamErr)
            })
          )

          renderFeed(authors)
        })

        return div
      }
    }
  }
}
