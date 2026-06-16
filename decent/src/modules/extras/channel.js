var h = require('hyperscript')
var u = require('../../util')
var pull = require('pull-stream')
var Scroller = require('../../scroller')
var mfr = require('map-filter-reduce')

exports.needs = {
  message_render: 'first',
  message_compose: 'first',
  sbot_log: 'first',
  sbot_messagesByType: 'first',
}

exports.gives = {
  message_meta: true, screen_view: true,
  connection_status: true, suggest_search: true
}

exports.create = function (api) {

  var channels

  // Used by the live map-filter-reduce pass over the log (client-side, not
  // query.read) to pick out channel names from incoming posts.
  var filter = {$filter: {value: {content: {channel: {$gt: ''}}}}}
  var map = {$map: {'name': ['value', 'content', 'channel']}}

  return {
    message_meta: function (msg) {
      var chan = msg.value.content.channel
      if (chan)
        return h('a', {href: '##'+chan}, '#'+chan)
    },
    screen_view: function (path) {
      if(path[0] === '#') {
        var channel = path.substr(1)

        var content = h('div.column.scroller__content')
        var div = h('div.column.scroller',
          {style: {'overflow':'auto'}},
          h('div.scroller__wrapper',
            api.message_compose({type: 'post', channel: channel}),
            content
          )
        )

        function matchesChannel(msg) {
          if (msg.sync) console.error('SYNC', msg)
          var c = msg && msg.value && msg.value.content
          return c && c.channel === channel
        }

        pull(
          api.sbot_log({old: false}),
          pull.filter(matchesChannel),
          Scroller(div, content, api.message_render, true, false)
        )

        pull(
          api.sbot_messagesByType({type: 'post', reverse: true, limit: 100, old: true, live: false}),
          pull.filter(matchesChannel),
          Scroller(div, content, api.message_render, false, false)
        )

        return div
      }
    },

    connection_status: function (err) {
      if(err) return

      channels = []

      // Historical channel ranks: count posts per channel. (sbot_query maps to
      // query.read, which the SQLite store doesn't support — it throws, which is
      // what spewed "query.read is not supported in SQLite mode" on every load.)
      pull(
        api.sbot_messagesByType({type: 'post', old: true, live: false}),
        pull.drain(function (msg) {
          var c = msg && msg.value && msg.value.content
          var name = c && typeof c.channel === 'string' && c.channel.trim()
          if (!name) return
          var existing = channels.find(function (e) { return e.name === name })
          if (existing) existing.rank++
          else channels.push({name: name, rank: 1})
        }, function (err) {
          if (err && err !== true) console.error(err)
        })
      )

      pull(
        api.sbot_log({old: false}),
        mfr.filter(filter),
        mfr.map(map),
        pull.drain(function (chan) {
          var c = channels.find(function (e) {
            return e.name === chan.name
          })
          if (c) c.rank++
          else channels.push(chan)
        })
      )
    },

    suggest_search: function (query) {
      return function (cb) {
        if(!/^#\w/.test(query)) return cb()
        cb(null, channels.filter(function (chan) {
          return ('#'+chan.name).substring(0, query.length) === query
        })
        .map(function (chan) {
          var name = '#'+chan.name
          return {
            title: name,
            value: name,
            subtitle: chan.rank
          }
        }))
      }
    }
  }
}
