'use strict'
var h    = require('hyperscript')
var pull = require('pull-stream')
var Scroller = require('../scroller')

exports.needs = {
  message_render:      'first',
  sbot_messagesByType: 'first'
}

exports.gives = {
  screen_view: true
}

var GIT_TYPES = ['git-repo', 'git-update', 'git-comment', 'issue', 'pull-request', 'issue-edit']

exports.create = function (api) {
  return {
    screen_view: function (route) {
      if (route !== 'code') return

      var content = h('div.column.scroller__content')
      var div = h('div.column.scroller',
        {style: {overflow: 'auto'}},
        h('div.scroller__wrapper',
          h('h4.git-section-title.code-feed-title', 'Code Activity'),
          content
        )
      )

      // Merge streams from all git-related message types, newest first
      // We collect up to 30 from each type then sort by timestamp
      var allMsgs = []
      var remaining = GIT_TYPES.length

      function done() {
        allMsgs.sort(function (a, b) { return b.value.timestamp - a.value.timestamp })
        allMsgs.slice(0, 100).forEach(function (msg) {
          var el = api.message_render(msg)
          if (el) content.appendChild(el)
        })
        if (!allMsgs.length) {
          content.appendChild(h('div.message',
            h('em', 'No code activity yet. Push a git repo to get started.')))
        }
      }

      GIT_TYPES.forEach(function (type) {
        pull(
          api.sbot_messagesByType({type: type, reverse: true, limit: 30}),
          pull.collect(function (err, msgs) {
            if (!err && msgs) {
              msgs.forEach(function (m) { allMsgs.push(m) })
            }
            if (--remaining === 0) done()
          })
        )
      })

      return div
    }
  }
}
