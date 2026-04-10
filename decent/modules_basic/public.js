var h = require('hyperscript')
var pull = require('pull-stream')
var Scroller = require('../scroller')
var keys = require('../keys')

//var plugs = require('../plugs')
//var message_render = plugs.first(exports.message_render = [])
//var message_compose = plugs.first(exports.message_compose = [])
//var sbot_log = plugs.first(exports.sbot_log = [])

exports.needs = {
  message_render: 'first',
  message_compose: 'first',
  sbot_messagesByType: 'first'
}

exports.gives = {
  builtin_tabs: true, screen_view: true
}

exports.create = function (api) {
  function isFollowMessage (msg) {
    var value = msg && msg.value
    var content = value && value.content
    return content &&
      content.type === 'contact' &&
      value.author === keys.id &&
      typeof content.contact === 'string'
  }

  function isVisiblePublicPost (msg, authors) {
    var value = msg && msg.value
    var content = value && value.content
    if (!value || !content || typeof content !== 'object') return false
    if (value.private || content.private || Array.isArray(content.recps)) return false
    if (content.type !== 'post') return false
    return !!authors[value.author]
  }

  function applyFollowState (authors, msg) {
    if (!isFollowMessage(msg)) return

    var content = msg.value.content
    if (content.blocking || content.following === false) delete authors[content.contact]
    else if (content.following === true) authors[content.contact] = true
  }

  function loadAuthors (cb) {
    pull(
      api.sbot_messagesByType({type: 'contact', old: true, live: false}),
      pull.collect(function (err, contacts) {
        if (err) return cb(err)

        var authors = {}
        authors[keys.id] = true

        ;(contacts || []).forEach(function (msg) {
          applyFollowState(authors, msg)
        })

        cb(null, authors)
      })
    )
  }

  return {
    builtin_tabs: function () {
      return ['public']
    },

    screen_view: function (path, sbot) {
      if(path === 'public') {

        var content = h('div.column.scroller__content')
        var div = h('div.column.scroller',
          {style: {'overflow':'auto'}},
          h('div.scroller__wrapper',
            api.message_compose(
              {type: 'post'},
              {placeholder: 'Write a public message', modal: true, triggerLabel: 'Compose', listenReplyEvents: true}
            ),
            content
          )
        )
        div.setAttribute('data-icon', 'key')

        loadAuthors(function (err, authors) {
          if (err) {
            content.appendChild(h('div.message.message-card',
              h('div.column', h('strong', 'Unable to load public feed'))
            ))
            console.error(err)
            return
          }

          pull(
            api.sbot_messagesByType({
              type: 'contact',
              old: false,
              live: true
            }),
            pull.drain(function (msg) {
              applyFollowState(authors, msg)
            }, function (streamErr) {
              if (streamErr && streamErr !== true) console.error(streamErr)
            })
          )

          pull(
            api.sbot_messagesByType({
              type: 'post',
              reverse: true,
              limit: 100,
              live: false,
              old: true
            }),
            pull.filter(function (msg) {
              return isVisiblePublicPost(msg, authors)
            }),
            Scroller(div, content, api.message_render, false, false)
          )

          pull(
            api.sbot_messagesByType({
              type: 'post',
              old: false,
              live: true
            }),
            pull.filter(function (msg) {
              return isVisiblePublicPost(msg, authors)
            }),
            Scroller(div, content, api.message_render, true, false)
          )
        })

        return div
      }
    }
  }
}
