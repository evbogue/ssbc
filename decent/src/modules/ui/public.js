var h = require('hyperscript')
var pull = require('pull-stream')
var Scroller = require('../../scroller')
var keys = require('../../keys')
var emptyState = require('../../empty-state')

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
  function isSsbskiSkin () {
    return !!document.querySelector('link[rel="stylesheet"][href*="ssbski-style.css"]')
  }

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

  // An encrypted message is detected purely structurally: its content is a
  // boxed string, not an object. We NEVER unbox here — Discover must not
  // decrypt anything. message_render turns these into a 🔒 mini card (the same
  // mini used for follows) via message_content_mini.
  function isEncryptedMessage (msg) {
    var value = msg && msg.value
    return !!(value && typeof value.content === 'string')
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
        var isSsbski = isSsbskiSkin()
        var publicLabel = isSsbski ? 'Discover' : 'Public'
        var friendsLabel = isSsbski ? 'Following' : 'Friends'
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
                inline: true,
                promptText: path === 'friends'
                  ? (isSsbski ? 'Post to Following...' : 'Write to your friends…')
                  : (isSsbski ? 'What is happening?' : 'Write a public message…'),
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
        div.title = path === 'friends' ? friendsLabel : publicLabel

        emptyState(content, path === 'friends'
          ? { icon: 'group', title: 'Your ' + friendsLabel + ' feed is empty',
              body: 'Follow some accounts and their posts will show up here.' }
          : { icon: 'tag', title: 'Nothing here yet',
              body: 'Posts from across the network will show up here.' })

        function renderFeed(authors) {
          // Discover interleaves encrypted messages (rendered as 🔒 mini cards,
          // never decrypted); Following stays public-only.
          var filter = path === 'friends'
            ? function (msg) { return isVisiblePublicMessage(msg, authors) }
            : function (msg) { return isPublicMessage(msg) || isEncryptedMessage(msg) }

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
