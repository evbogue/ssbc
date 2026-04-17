'use strict'
var h    = require('hyperscript')
var pull = require('pull-stream')
var human = require('human-time')

exports.needs = {
  sbot_search:         'first',
  avatar_name:         'first',
  avatar_image:        'first',
  message_render:      'first'
}

exports.gives = {
  screen_view: true
}

exports.create = function (api) {

  function renderResultItem(msg, type) {
    var c = msg.value.content
    var title = c.name || c.title || c.text || msg.key
    var author = msg.value.author
    var date = new Date(msg.value.timestamp)
    var href = type === 'repo' ? '#git/' + encodeURIComponent(msg.key) : '#' + msg.key

    return h('div.git-forge-list-item',
      api.avatar_image(author, 'thumbnail'),
      h('div.git-forge-list-item-main',
        h('a.git-forge-list-item-title', {href: href}, title),
        h('div.git-forge-list-item-meta',
          h('span.git-mesh-status', type),
          ' ', human(date), ' by ', api.avatar_name(author)
        )
      )
    )
  }

  return {
    screen_view: function (route) {
      if (route.indexOf('code-search/') !== 0) return

      var query = decodeURIComponent(route.slice(12)).toLowerCase()
      var results = h('div.git-forge-list')
      var empty = h('div.git-forge-list-empty', '')

      var wrapper = h('div.scroller__wrapper',
        h('div.git-forge-container',
          results,
          empty
        )
      )
      var outer = h('div.column.scroller', {style: {overflow: 'auto'}}, wrapper)

      api.sbot_search({ query: query, limit: 50 }, function (err, msgs) {
        empty.style.display = 'none'
        if (err) {
          results.appendChild(h('div.git-forge-list-empty', 'Search error: ' + err.message))
          return
        }
        if (!msgs || msgs.length === 0) {
          results.appendChild(h('div.git-forge-list-empty', 'No results'))
          return
        }

        msgs.forEach(function (msg) {
          var type = msg.value.content.type
          var el = api.message_render(msg)
          if (el) {
            // Add a badge to indicate it was a search hit if it's a known forge type
            if (type === 'git-repo' || type === 'issue' || type === 'pull-request') {
              var badge = h('span.git-mesh-status', type === 'git-repo' ? 'repo' : type)
              var header = el.querySelector('.title, .meta, .header')
              if (header) header.appendChild(badge)
            }
            results.appendChild(el)
          }
        })
      })

      return outer
    }
  }
}
