var h = require('hyperscript')

exports.needs = {
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
      var vc = value.content
      var authorEl = h('div.quoted-post-header',
        h('span.material-symbols-outlined', {style: {fontSize: '13px', verticalAlign: 'middle'}}, 'repeat'),
        ' ',
        api.avatar_link(value.author, h('span.quoted-post-author', api.avatar_name(value.author)))
      )
      var text = (vc.text || '').slice(0, 300) + (vc.text && vc.text.length > 300 ? '…' : '')
      quoteEl.appendChild(authorEl)
      if (text) quoteEl.appendChild(h('div.quoted-post-text', text))
    })

    var parts = []
    if (reNode) parts.push(reNode)
    parts.push(mdEl)
    parts.push(quoteEl)
    return h('div', parts)
  }

  return x
}
