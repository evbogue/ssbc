var markdown = require('ssb-markdown')
var h = require('hyperscript')
var u = require('../util')
var ref = require('ssb-ref')

//render a message

//var plugs = require('../plugs')
//var message_link = plugs.first(exports.message_link = [])
//var markdown = plugs.first(exports.markdown = [])
//

exports.needs = { message_link: 'first', markdown: 'first' }

exports.gives = {
  message_content: true
}

exports.create = function (api) {
  var exports = {}

  exports.message_content = function (data) {
    if(!data.value.content || !data.value.content.text) return

    var root = data.value.content.root
    if(!root) return api.markdown(data.value.content)
    var re = h('span', 're: ', api.message_link(root))

    return h('div', re, api.markdown(data.value.content))

  }

  return exports
}










