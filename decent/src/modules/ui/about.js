
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
    // Render a mini for name, photo, and/or banner updates (not for a lone
    // description or other metadata-only about).
    if(!about.name && !about.image && !about.headerImage) return

    var self = about.about === msg.value.author

    function thumb (link, cls) {
      return h('a', {href: "#" + id},
        h('img.' + cls, {src: api.blob_url(asLink(link))}))
    }

    // A name change keeps the familiar "self-identifies as <name>" phrasing,
    // with any photo/banner thumbnail appended.
    if(about.name) {
      var bits = [
        self
          ? h('span', 'self-identifies')
          : h('span', 'identifies ', api.avatar_link(id, api.avatar_name(id), '')),
        ' as ', h('a', {href: "#" + id}, about.name)
      ]
      if(about.image)       bits.push(' ', thumb(about.image, 'avatar--thumbnail about-mini__photo'))
      if(about.headerImage) bits.push(' ', thumb(about.headerImage, 'about-mini__banner'))
      return bits
    }

    // No name change → a photo and/or banner update. Describe the action (the
    // author chip is already rendered by the mini card) and show a thumbnail.
    var who = self ? '' : [api.avatar_link(id, api.avatar_name(id), ''), ' ']
    var clauses = []
    if(about.image)
      clauses.push(self
        ? ['set a new profile photo ', thumb(about.image, 'avatar--thumbnail about-mini__photo')]
        : ['set a photo for ', thumb(about.image, 'avatar--thumbnail about-mini__photo')])
    if(about.headerImage)
      clauses.push(self
        ? ['set a new profile background ', thumb(about.headerImage, 'about-mini__banner')]
        : ['set a background for ', thumb(about.headerImage, 'about-mini__banner')])

    var out = self ? [] : who.slice()
    clauses.forEach(function (c, i) {
      if(i > 0) out.push(' and ')
      out.push.apply(out, c)
    })
    return out
  }

  return exports
}
