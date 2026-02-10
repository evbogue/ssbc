var h = require('hyperscript')
var u = require('../util')
var pull = require('pull-stream')
var Scroller = require('pull-scroll')

var plugs = require('../plugs')
//var message_render = plugs.first(exports.message_render = [])
//var message_compose = plugs.first(exports.message_compose = [])

// from ssb-ref
var refRegex = /((?:@|%|&)[A-Za-z0-9\/+]{43}=\.[\w\d]+)/g

exports.gives = 'message_meta'

function linkify (text) {
  var arr = text.split(refRegex)
  for (var i = 1; i < arr.length; i += 2) {
    arr[i] = h('a', {href: '#' + arr[i]}, arr[i])
  }
  return arr
}

exports.create = function (api) {
  return function (msg) {
    var tmp = h('div')
    var el
    var pre
    var raw
    function findMessageEl (node) {
      while (node && node.classList) {
        if (node.classList.contains('message')) return node
        node = node.parentNode
      }
      return null
    }
    return h('input', {
      type: 'checkbox',
      title: 'View Data',
      onclick: function () {
        var msgEl = findMessageEl(this)
        if (!msgEl) return
        var msgContentEl = msgEl.querySelector('.message_content')
        var isMini = msgEl.classList.contains('message--mini')
        if (this.checked) {
          if (isMini) {
            if (!raw) {
              raw = h('div.message_raw',
                h('pre', h('code',
                  linkify(JSON.stringify({
                    key: msg.key,
                    value: msg.value
                  }, 0, 2))
                ))
              )
            }
            msgEl.appendChild(raw)
          } else {
            // move away the content
            while (el = msgContentEl.firstChild)
              tmp.appendChild(el)
            // show the raw stuff
            if (!pre) pre = h('pre', linkify(JSON.stringify({
              key: msg.key,
              value: msg.value
            }, 0, 2)))
            msgContentEl.appendChild(pre)
          }
        } else {
          if (isMini) {
            if (raw && raw.parentNode) raw.parentNode.removeChild(raw)
          } else {
            // hide the raw stuff
            msgContentEl.removeChild(pre)
            // put back the content
            while (el = tmp.firstChild)
              msgContentEl.appendChild(el)
          }
        }
      }
    })
  }
}
