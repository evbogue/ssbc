'use strict'
var h = require('hyperscript')

exports.needs = {
  avatar_name:     'first',
  avatar_link:     'first',
  message_confirm: 'first',
  message_link:    'first',
  sbot_get:        'first'
}

exports.gives = {
  message_content:      true,
  message_content_mini: true,
  message_action:       true
}

exports.create = function (api) {
  var x = {}

  // Render a repost message in the feed
  x.message_content =
  x.message_content_mini = function (msg) {
    if (msg.value.content.type !== 'repost') return
    var c = msg.value.content
    if (!c.repost) return

    var inner = h('div.repost-inner', h('em', 'Loading…'))

    api.sbot_get(c.repost, function (err, value) {
      inner.innerHTML = ''
      if (err || !value || !value.content || typeof value.content !== 'object') {
        inner.appendChild(h('em.repost-unavailable', 'Original post not available'))
        return
      }
      var vc = value.content
      var authorEl = h('div.repost-inner-header',
        h('span.material-symbols-outlined', {style: {fontSize: '13px', verticalAlign: 'middle'}}, 'repeat'),
        ' ',
        api.avatar_link(value.author, h('span', api.avatar_name(value.author)))
      )
      var text = (vc.text || '').slice(0, 400) + (vc.text && vc.text.length > 400 ? '…' : '')
      inner.appendChild(authorEl)
      if (text) inner.appendChild(h('div.repost-inner-text', text))
    })

    return h('div.repost-card', inner)
  }

  // Repost + Quote buttons on regular posts
  x.message_action = function (msg) {
    var type = msg.value.content.type
    if (type === 'vote' || type === 'repost') return

    var repostBtn = h('button.action-btn.action-btn--repost', {
      type: 'button',
      title: 'Repost',
      onclick: function (e) {
        e.preventDefault()
        api.message_confirm({
          type: 'repost',
          repost: msg.key,
          repostAuthor: msg.value.author
        })
      }
    }, h('span.material-symbols-outlined.action-icon', 'repeat'))

    var quoteBtn = h('button.action-btn.action-btn--quote', {
      type: 'button',
      title: 'Quote',
      onclick: function (e) {
        e.preventDefault()
        var ev
        try {
          ev = new CustomEvent('decent:quote', {detail: {msg: msg}, cancelable: true})
        } catch (_) {
          ev = document.createEvent('CustomEvent')
          ev.initCustomEvent('decent:quote', false, true, {msg: msg})
        }
        if (window.dispatchEvent(ev)) {
          try {
            window.sessionStorage.setItem('decent_quote_intent', msg.key)
          } catch (err) {}
          window.location.hash = '#/'
        }
      }
    }, h('span.material-symbols-outlined.action-icon', 'format_quote'))

    return [repostBtn, quoteBtn]
  }

  return x
}
