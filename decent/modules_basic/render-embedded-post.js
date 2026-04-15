'use strict'
var h = require('hyperscript')

module.exports = function renderEmbeddedPost (api, msg, variant) {
  var meta = api.message_meta(msg)
  var content = renderEmbeddedContent(api, msg)

  return h('div.embedded-post.embedded-post--' + variant,
    h('div.embedded-post-kicker',
      h('span.material-symbols-outlined.embedded-post-kicker-icon',
        variant === 'quote' ? 'format_quote' : 'repeat'
      ),
      h('span.embedded-post-kicker-label',
        variant === 'quote' ? 'Quoted post' : 'Reposted post'
      )
    ),
    h('div.embedded-post-header',
      api.avatar_image_link(msg.value.author, 'thumbnail'),
      h('div.embedded-post-meta',
        h('div.embedded-post-author-row',
          api.avatar_link(msg.value.author, h('span.embedded-post-author', api.avatar_name(msg.value.author))),
          h('div.embedded-post-message-meta.row', meta)
        )
      )
    ),
    h('div.embedded-post-body', content)
  )
}

function renderEmbeddedContent (api, msg) {
  var content = msg.value.content

  if (content.type === 'post' && typeof content.text === 'string') {
    var copy = {}
    for (var k in content) copy[k] = content[k]
    delete copy.quote
    return api.markdown(copy)
  }

  return h('div.embedded-post-text', content.type || 'post')
}
