'use strict'
var h    = require('hyperscript')
var pull = require('pull-stream')
var human = require('human-time')

exports.needs = {
  sbot_messagesByType: 'first',
  sbot_links:          'first',
  avatar_name:         'first',
  avatar_image:        'first',
  message_compose:     'first'
}

exports.gives = {
  screen_view: true
}

exports.create = function (api) {

  function repoCard(msg) {
    var c       = msg.value.content
    var repoId  = msg.key
    var author  = msg.value.author
    var name    = c.name || ('repo ' + repoId.substr(1, 8) + '…')
    // msg.lastActivity is the newest push (git-update) timestamp, falling back
    // to the repo creation time when nothing has been pushed yet.
    var pushed  = msg.lastActivity || msg.value.timestamp
    var date    = new Date(pushed)
    var pushedLabel = msg.lastActivity ? 'pushed ' : 'created '
    var browse  = '#git/' + encodeURIComponent(repoId)
    var cloneUrl = window.location.origin + '/git/' + encodeURIComponent(repoId)

    var branchEl = h('span.git-repo-meta-item', '…')
    ;(function () {
      var xhr = new XMLHttpRequest()
      xhr.open('GET', cloneUrl + '/json/refs')
      xhr.onload = function () {
        if (xhr.status !== 200) { branchEl.textContent = ''; return }
        var data
        try { data = JSON.parse(xhr.responseText) } catch (_) { return }
        var heads = ((data && data.refs) || []).filter(function (r) {
          return /^refs\/heads\//.test(r.name)
        })
        branchEl.textContent = heads.length + ' branch' + (heads.length !== 1 ? 'es' : '')
      }
      xhr.onerror = function () { branchEl.textContent = '' }
      xhr.send()
    }())

    return h('div.repos-card',
      h('div.repos-card-header',
        api.avatar_image(author, 'thumbnail'),
        h('span.repos-card-owner', api.avatar_name(author))
      ),
      h('h3.repos-card-name', h('a', {href: browse}, name)),
      h('div.repos-card-meta', branchEl, h('span.repos-card-date', ' · ', pushedLabel, human(date))),
      h('div.repos-card-footer',
        h('a.git-branch-badge', {href: browse}, 'Browse'),
        ' ',
        h('code.git-clone-input.repos-card-clone', {
          title: 'Click to copy clone URL',
          onclick: function () {
            if (navigator.clipboard) navigator.clipboard.writeText(cloneUrl)
            this.style.background = '#d1fae5'
            var self = this
            setTimeout(function () { self.style.background = '' }, 800)
          }
        }, cloneUrl)
      )
    )
  }

  function renderCreateForm(container, onCreated) {
    var form = h('div.git-forge-card', {style: {margin: '20px 0'}},
      h('div.git-forge-card-header', 'Create New Repository'),
      h('div.git-forge-card-body',
        api.message_compose(
          { type: 'git-repo' },
          function (val) {
            // Transform the composer output to a git-repo message
            return { type: 'git-repo', name: val.text }
          },
          function (err, msg) {
            if (err) return alert(err)
            if (msg) onCreated(msg)
          }
        )
      )
    )
    container.insertBefore(form, container.firstChild)
  }

  return {
    screen_view: function (route) {
      if (route !== 'repos') return

      var grid    = h('div.repos-grid')
      var empty   = h('p.repos-empty', 'No repositories found. Create one to get started.')
      var count   = 0
      
      var createArea = h('div')
      var header = h('div.repos-header', {style: {display: 'flex', 'justify-content': 'space-between', 'align-items': 'center'}},
        h('h2.repos-heading', 'Repositories'),
        h('button.git-forge-btn-primary', {
          title: 'Create a new git repository',
          onclick: function () {
            this.style.display = 'none'
            renderCreateForm(createArea, function (msg) {
              window.location.hash = '#git/' + encodeURIComponent(msg.key)
            })
          }
        }, 'New Repository')
      )

      var wrapper = h('div.scroller__wrapper',
        header,
        createArea,
        grid,
        empty
      )
      var outer = h('div.column.scroller', {style: {overflow: 'auto'}}, wrapper)

      // Two passes: first map each repo to the timestamp of its newest push
      // (git-update), then load the repos and sort by that so the list is in
      // most-recently-pushed-first order rather than creation order.
      var lastPush = {}

      function renderRepos() {
        pull(
          api.sbot_messagesByType({type: 'git-repo', reverse: true, limit: 200, live: false, old: true}),
          pull.collect(function (err, msgs) {
            if (err && err !== true) console.error('repos load error:', err)
            msgs = msgs || []
            msgs.forEach(function (msg) {
              msg.lastActivity = lastPush[msg.key] || 0
            })
            msgs.sort(function (a, b) {
              return (b.lastActivity || b.value.timestamp) - (a.lastActivity || a.value.timestamp)
            })
            msgs.forEach(function (msg) {
              count++
              grid.appendChild(repoCard(msg))
            })
            empty.style.display = count === 0 ? '' : 'none'
          })
        )
      }

      // git-update messages carry `repo: <repoKey>`; because the stream is
      // newest-first, the first one we see per repo is its latest push.
      pull(
        api.sbot_messagesByType({type: 'git-update', reverse: true, limit: 1000, live: false, old: true}),
        pull.drain(function (msg) {
          var repo = msg.value.content && msg.value.content.repo
          if (repo && !lastPush[repo]) lastPush[repo] = msg.value.timestamp
        }, function (err) {
          if (err && err !== true) console.error('repo updates load error:', err)
          renderRepos()
        })
      )

      return outer
    }
  }
}
