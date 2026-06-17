
var h = require('hyperscript')

function asLink (ln) {
  return 'string' === typeof ln ? ln : ln.link
}

//var blob_url = require('../../wire').first(exports.blob_url = [])

exports.needs = {
  blob_url: 'first',
  avatar_link: 'first',
  avatar_name: 'first'
}

exports.gives = {
  message_content: true,
  message_content_mini: true
}

exports.create = function (api) {
  var exports = {}

  exports.message_content = function (msg) {
    if(msg.value.content.type !== 'about') return

    if(!msg.value.content.image && !msg.value.content.name && !msg.value.content.description)
      return

    var about = msg.value.content
    var id = msg.value.content.about
    return h('div',
      h('p',
        about.about === msg.value.author
          ? h('span', 'self-identifies ')
          : h('span', 'identifies ', api.avatar_link(id, api.avatar_name(id), '')),
        ' as ',
        h('a', {href:"#"+about.about},
          about.name || null,
          about.image
          ? h('img.avatar--thumbnail', {src: api.blob_url(asLink(about.image))})
          : null
        )
      ),
      about.description
        ? h('p', h('em', '"' + about.description + '"'))
        : null
    )
  }

  exports.message_content_mini = function (msg) {
    if(msg.value.content.type !== 'about') return

    var about = msg.value.content
    var id = about.about
    // Render a mini for name and/or photo updates (not for image-less,
    // name-less abouts such as a lone description).
    if(!about.name && !about.image) return

    var bits = [
      about.about === msg.value.author
        ? h('span', 'self-identifies')
        : h('span', 'identifies ', api.avatar_link(id, api.avatar_name(id), ''))
    ]

    if(about.name)
      bits.push(' as ', h('a', {href:"#"+id}, about.name))

    // Show the new profile photo so a photo change is visible in the feed.
    if(about.image)
      bits.push(
        about.name ? ' ' : ' with a new photo ',
        h('a', {href:"#"+id},
          h('img.avatar--thumbnail.about-mini__photo', {src: api.blob_url(asLink(about.image))}))
      )

    return bits
  }

  return exports
}
