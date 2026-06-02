
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
    var id = msg.value.content.about
    if(!about.name) return

    if(about.about === msg.value.author)
      return ['self-identifies as ', h('a', {href:"#"+about.about}, about.name)]

    return ['identifies ', api.avatar_link(id, api.avatar_name(id), ''), ' as ', h('a', {href:"#"+about.about}, about.name)]
  }

  return exports
}
