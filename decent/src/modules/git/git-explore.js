'use strict'
var h    = require('hyperscript')
var pull = require('pull-stream')
var human = require('human-time')

exports.needs = {
  sbot_messagesByType: 'first',
  sbot_links:          'first',
  avatar_name:         'first',
  avatar_image:        'first',
  message_render:      'first'
}

exports.gives = {
  screen_view: true
}

exports.create = function (api) {

  function renderExploreHeader() {
    return h('div.git-forge-header', {style: {padding: '24px 32px'}},
      h('h2', 'Explore Code on the Mesh'),
      h('p', {style: {color: '#57606a'}}, 'Discover repositories, pull requests, and activity across your P2P network.')
    )
  }

  function renderSection(title, content) {
    return h('div', {style: {margin: '24px 0'}},
      h('h3', {style: {borderBottom: '1px solid #d0d7de', paddingBottom: '8px', marginBottom: '16px'}}, title),
      content
    )
  }

  return {
    screen_view: function (route) {
      if (route !== 'code-explore') return

      var trendingRepos = h('div.repos-grid')
      var recentUpdates = h('div')
      var openWork      = h('div.git-forge-list')

      var wrapper = h('div.scroller__wrapper',
        renderExploreHeader(),
        h('div.git-forge-container',
          renderSection('Active Repositories', trendingRepos),
          h('div.git-forge-main',
            h('div.git-forge-content', 
              renderSection('Recent Mesh Updates', recentUpdates)
            ),
            h('div.git-forge-sidebar',
              renderSection('Open Issues & PRs', openWork)
            )
          )
        )
      )
      var outer = h('div.column.scroller', {style: {overflow: 'auto'}}, wrapper)

      // Fetch active repos (just use git-repo for now)
      pull(
        api.sbot_messagesByType({type: 'git-repo', reverse: true, limit: 6}),
        pull.drain(function (msg) {
          var c = msg.value.content
          var browse = '#git/' + encodeURIComponent(msg.key)
          trendingRepos.appendChild(h('div.repos-card',
            h('div.repos-card-header',
              api.avatar_image(msg.value.author, 'thumbnail'),
              h('span.repos-card-owner', api.avatar_name(msg.value.author))
            ),
            h('h3.repos-card-name', h('a', {href: browse}, c.name || msg.key.substr(0, 10))),
            h('div.repos-card-meta', human(new Date(msg.value.timestamp)))
          ))
        })
      )

      // Fetch recent updates
      pull(
        api.sbot_messagesByType({type: 'git-update', reverse: true, limit: 20}),
        pull.drain(function (msg) {
          var el = api.message_render(msg)
          if (el) recentUpdates.appendChild(el)
        })
      )

      // Fetch open issues/PRs
      pull(
        api.sbot_messagesByType({type: 'issue', reverse: true, limit: 50}),
        pull.filter(function (msg) { return msg.value.content.open !== false }),
        pull.take(10),
        pull.drain(function (msg) {
          var c = msg.value.content
          openWork.appendChild(h('div.git-forge-list-item',
            h('div.git-forge-list-item-main',
              h('a.git-forge-list-item-title', {href: '#' + msg.key}, c.title || c.text || 'Untitled Issue'),
              h('div.git-forge-list-item-meta', human(new Date(msg.value.timestamp)), ' by ', api.avatar_name(msg.value.author))
            )
          ))
        })
      )

      return outer
    }
  }
}
