var h = require('hyperscript')
//var plugs = require('../plugs')
//var avatar_name = plugs.first(exports.avatar_name = [])
//var avatar_link = plugs.first(exports.avatar_link = [])
//
exports.needs = {
  avatar_name: 'first',
  avatar_link: 'first'
}

exports.gives = {
  message_content: true,
  message_content_mini: true
}

exports.create = function (api) {
  var exports = {}

  exports.message_content = function (msg, sbot)  {
    var c = msg.value.content
    if (c.type === 'pub') {
      var address = c.address || {}
      return [
        h('p', 'announced an address for ',
          api.avatar_link(address.key, api.avatar_name(address.key)), ':'),
        h('blockquote',
          h('code', address.host + ':' + address.port)
        )
      ]
    }
  }

  exports.message_content_mini = function (msg) {
    var c = msg.value.content
    if (c.type !== 'pub') return
    var address = c.address || {}
    if(!address.key || !address.host || !address.port) return
    return [
      'announced ',
      api.avatar_link(address.key, api.avatar_name(address.key)),
      ': ',
      h('code', address.host + ':' + address.port)
    ]
  }

  return exports

}
