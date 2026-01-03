'use strict'
var h = require('hyperscript')
var u = require('../util')
var pull = require('pull-stream')
var Scroller = require('pull-scroll')
var ref = require('ssb-ref')
var keys = require('../keys')

function map(ary, iter) {
  if(Array.isArray(ary)) return ary.map(iter)
}

exports.needs = {
  message_render: 'first',
  message_compose: 'first',
  message_unbox: 'first',
  sbot_log: 'first',
  avatar_image_link: 'first'
}

exports.gives = {
  builtin_tabs: true,
  screen_view: true,
  message_meta: true,
  message_content_mini: true
}

exports.create = function (api) {
  var id = keys.id

  function privateStream (opts) {
    return pull(
      u.next(api.sbot_log, opts),
      pull.map(function (msg) {
        if(!msg || !msg.value || 'string' != typeof msg.value.content) return null
        var unboxed = api.message_unbox(msg)
        if(unboxed) {
          unboxed.value.private = true
          return unboxed
        }
        return null
      }),
      pull.filter(Boolean)
    )
  }

  return {
    builtin_tabs: function () {
      return ['private']
    },

    screen_view: function (path) {
      if(path !== 'private') return

      var div = h('div.column.scroller',
          {style: {'overflow':'auto'}})
      div.setAttribute('data-icon', 'lock')

      var compose = api.message_compose(
        {type: 'post', recps: [], private: true},
        {
          prepublish: function (msg) {
            msg.recps = [id].concat(msg.mentions).filter(function (e) {
              return ref.isFeed('string' === typeof e ? e : e.link)
            })
            if(!msg.recps.length)
              throw new Error('cannot make private message without recipients - just mention the user in an at reply in the message you send')
            return msg
          },
          placeholder: 'Write a private message'
        }
        )

      var content = h('div.column.scroller__content')
      div.appendChild(h('div.scroller__wrapper', compose, content))

      pull(
        privateStream({old: false, limit: 100}),
        Scroller(div, content, api.message_render, true, false)
      )

      pull(
        privateStream({reverse: true, limit: 1000}),
        Scroller(div, content, api.message_render, false, false, function (err) {
          if(err) throw err
        })
      )

      return div
    },

    message_meta: function (msg) {
      var content = msg.value.content
      var recps = content && content.recps
      var isEncryptedString = 'string' === typeof content
      var isPrivate = msg.value.private ||
        (content && content.private) ||
        (Array.isArray(recps) && recps.length) ||
        isEncryptedString

      if(!isPrivate) return

      return h('span.message_meta.row', map(recps, function (id) {
        return api.avatar_image_link('string' == typeof id ? id : id.link, 'thumbnail')
      }))
    },

    message_content_mini: function (msg, sbot)  {
      var isEncrypted = typeof msg.value.content === 'string'
      if(!msg.value.private && !isEncrypted) return
      if(msg.value.content && typeof msg.value.content === 'object' && msg.value.content.text)
        return
      return '🔒'
    }
  }

}
