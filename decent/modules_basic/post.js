var h = require('hyperscript')
var renderEmbeddedPost = require('./render-embedded-post')

exports.needs = {
  avatar_image_link: 'first',
  message_meta:  'map',
  message_link: 'first',
  markdown:     'first',
  sbot_get:     'first',
  avatar_name:  'first',
  avatar_link:  'first'
}

exports.gives = {
  message_content: true
}

exports.create = function (api) {
  var x = {}

  function isInteractiveTarget (target, container) {
    while (target && target !== container) {
      var tag = target.tagName
      if (
        tag === 'A' ||
        tag === 'BUTTON' ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'SUMMARY'
      ) return true
      target = target.parentNode
    }
    return false
  }

  function makeCardNavigable (el, targetId) {
    function goToTarget () {
      window.location.hash = '#' + targetId
    }

    el.classList.add('embedded-link-card')
    el.setAttribute('tabindex', '0')
    el.setAttribute('role', 'link')

    el.addEventListener('click', function (ev) {
      if (ev.defaultPrevented) return
      if (ev.button != null && ev.button !== 0) return
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
      if (isInteractiveTarget(ev.target, el)) return
      goToTarget()
    })

    el.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return
      if (isInteractiveTarget(ev.target, el)) return
      ev.preventDefault()
      goToTarget()
    })
  }

  x.message_content = function (data) {
    if (!data.value.content || !data.value.content.text) return

    var c      = data.value.content
    var root   = c.root
    var quoteId = c.quote

    var reNode = root ? h('span.re-line', 're: ', api.message_link(root)) : null
    var mdEl   = api.markdown(c)

    if (!quoteId) {
      return reNode ? h('div', reNode, mdEl) : mdEl
    }

    // Quoted post — async fetch and render inline card
    var quoteEl = h('div.quoted-post')

    // Clicking the card body navigates to the original post's thread.
    // Guard: if the click came from inside an <a> (the author link), let it go.
    quoteEl.addEventListener('click', function (e) {
      var node = e.target
      while (node && node !== quoteEl) {
        if (node.tagName === 'A') return
        node = node.parentNode
      }
      window.location.hash = '#' + quoteId
    })

    api.sbot_get(quoteId, function (err, value) {
      if (err || !value || !value.content || typeof value.content !== 'object') return
      var quotedMsg = { key: quoteId, value: value }
      makeCardNavigable(quoteEl, quoteId)
      quoteEl.appendChild(renderEmbeddedPost(api, quotedMsg, 'quote'))
    })

    var parts = []
    if (reNode) parts.push(reNode)
    parts.push(mdEl)
    parts.push(quoteEl)
    return h('div', parts)
  }

  return x
}
