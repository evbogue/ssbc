'use strict'

var h = require('hyperscript')

// Muted placeholder for a feed/list scroller that loaded no message rows
// (empty profile feed, no notifications, no DMs). The node lives inside the
// scroller's `content` element, starts hidden, and is revealed by a
// MutationObserver only after a short grace period — so screens that DO load
// rows never flash it (the node stays display:none whenever a .message is
// present, and isn't shown until the stream has had time to settle). If a live
// message arrives later, the observer hides the placeholder again.
//
// Usage: emptyState(content, { icon: 'notifications', title: '…', body: '…' })
module.exports = function emptyState (content, opts) {
  opts = opts || {}

  var node = h('div.feed-empty', { style: { display: 'none' } },
    opts.icon ? h('span.feed-empty__icon.material-symbols-outlined', opts.icon) : null,
    h('div.feed-empty__title', opts.title || 'Nothing here yet'),
    opts.body ? h('div.feed-empty__body', opts.body) : null
  )
  content.appendChild(node)

  var ready = false
  function sync () {
    if (!ready) return
    node.style.display = content.querySelector('.message, .message-card') ? 'none' : ''
  }

  if (typeof MutationObserver !== 'undefined')
    new MutationObserver(sync).observe(content, { childList: true })

  setTimeout(function () { ready = true; sync() }, 600)

  return node
}
