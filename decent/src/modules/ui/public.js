var h = require('hyperscript')
var pull = require('pull-stream')
var Scroller = require('../../scroller')
var keys = require('../../keys')

//var plugs = require('../../wire')
//var message_render = plugs.first(exports.message_render = [])
//var message_compose = plugs.first(exports.message_compose = [])
//var sbot_log = plugs.first(exports.sbot_log = [])

exports.needs = {
  message_render: 'first',
  message_compose: 'first',
  sbot_messagesByType: 'first',
  sbot_log: 'first'
}

exports.gives = {
  builtin_tabs: true, screen_view: true
}

exports.create = function (api) {
  function isPublicMessage (msg) {
    var value = msg && msg.value
    var content = value && value.content
    if (!value || !content || typeof content !== 'object') return false
    if (value.private || content.private || Array.isArray(content.recps)) return false
    return true
  }

  function isFollowMessage (msg) {
    var value = msg && msg.value
    var content = value && value.content
    return content &&
      content.type === 'contact' &&
      value.author === keys.id &&
      typeof content.contact === 'string'
  }

  function isVisiblePublicMessage (msg, authors) {
    if (!isPublicMessage(msg)) return false
    var value = msg.value
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
      return ['public', 'friends']
    },

    screen_view: function (path, sbot) {
      if(path === 'public' || path === 'friends') {
        var autoOpen = false
        var initialQuote = null
        if (path === 'public') {
          try {
            initialQuote = window.sessionStorage.getItem('decent_quote_intent')
            autoOpen = !!initialQuote
            if (initialQuote) window.sessionStorage.removeItem('decent_quote_intent')
          } catch (err) {}
        }

        var content = h('div.column.scroller__content')
        var div = h('div.column.scroller',
          {style: {'overflow':'auto'}},
          h('div.scroller__wrapper',
            api.message_compose(
              {type: 'post'},
              {
                placeholder: 'Write a public message',
                modal: true,
                triggerLabel: 'Compose',
                listenReplyEvents: true,
                autoOpen: autoOpen,
                initialQuote: initialQuote
              }
            ),
            content
          )
        )
        div.setAttribute('data-icon', 'key')
        div.title = path === 'friends' ? 'Friends' : 'Public'

        function renderFeed(authors) {
          var filter = path === 'friends'
            ? function (msg) { return isVisiblePublicMessage(msg, authors) }
            : isPublicMessage

          pull(
            api.sbot_log({
              reverse: true,
              limit: 100,
              live: false,
              old: true
            }),
            pull.filter(filter),
            Scroller(div, content, api.message_render, false, false)
          )

          pull(
            api.sbot_log({
              old: false,
              live: true
            }),
            pull.filter(filter),
            Scroller(div, content, api.message_render, true, false)
          )
        }

        if (path === 'public') {
          renderFeed()
          return div
        }

        loadAuthors(function (err, authors) {
          if (err) {
            content.appendChild(h('div.message.message-card',
              h('div.column', h('strong', 'Unable to load friends feed'))
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

          renderFeed(authors)
        })

        return div
      }
    }
  }
}
