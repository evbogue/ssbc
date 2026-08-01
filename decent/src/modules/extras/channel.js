var h = require('hyperscript')
var u = require('../../util')
var pull = require('pull-stream')
var Scroller = require('../../scroller')
var mfr = require('map-filter-reduce')

exports.needs = {
  avatar_image: 'first',
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

  // Channel browsing (the Channels page + per-channel header) is shared by every
  // modern skin; legacy Decent keeps its plain channel stream.
  function isSsbproSkin () {
    return require('../../skin').isNetwork()
  }

  function cleanChannel (name) {
    return String(name || '').replace(/^#/, '').trim().toLowerCase()
  }

  function channelHref (name) {
    return '#channel/' + encodeURIComponent(cleanChannel(name))
  }

  function hasTag (text, channel) {
    if (!text) return false
    var re = new RegExp('(^|\\s)#' + channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    return re.test(text)
  }

  function groupNameFromRoute (path) {
    if (path.indexOf('channel/') === 0)
      return cleanChannel(decodeURIComponent(path.slice(8)))
    if (path[0] === '#') return cleanChannel(path.substr(1))
    return ''
  }

  function isPublicPost (msg) {
    var v = msg && msg.value
    var c = v && v.content
    if (!v || !c || typeof c !== 'object' || c.type !== 'post') return false
    if (v.private || c.private || Array.isArray(c.recps)) return false
    return true
  }

  function matchesGroup (msg, channel) {
    if (!isPublicPost(msg)) return false
    var c = msg.value.content
    return cleanChannel(c.channel) === channel || hasTag(c.text, channel)
  }

  function loadGroupSummaries (cb) {
    pull(
      api.sbot_messagesByType({type: 'post', reverse: true, limit: 700, old: true, live: false}),
      pull.collect(function (err, msgs) {
        if (err) return cb(err)
        var byName = {}
        function ensure (name) {
          name = cleanChannel(name)
          if (!name) return null
          if (!byName[name]) byName[name] = {
            name: name,
            count: 0,
            authors: {},
            authorOrder: [],
            latestText: '',
            latestTime: 0
          }
          return byName[name]
        }
        ;(msgs || []).forEach(function (msg) {
          if (!isPublicPost(msg)) return
          var v = msg.value
          var c = v.content
          var names = []
          if (typeof c.channel === 'string') names.push(c.channel)
          if (typeof c.text === 'string') {
            var tags = c.text.match(/#[a-zA-Z0-9][a-zA-Z0-9_-]*/g)
            if (tags) tags.forEach(function (tag) { names.push(tag) })
          }
          names.forEach(function (name) {
            var group = ensure(name)
            if (!group) return
            group.count++
            if (!group.authors[v.author]) {
              group.authors[v.author] = true
              group.authorOrder.push(v.author)
            }
            var time = v.timestamp || msg.timestamp || 0
            if (time >= group.latestTime) {
              group.latestTime = time
              group.latestText = c.text || ''
            }
          })
        })
        cb(null, Object.keys(byName).map(function (name) {
          return byName[name]
        }).sort(function (a, b) {
          if (b.count !== a.count) return b.count - a.count
          return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
        }))
      })
    )
  }

  // Used by the live map-filter-reduce pass over the log (client-side, not
  // query.read) to pick out channel names from incoming posts.
  var filter = {$filter: {value: {content: {channel: {$gt: ''}}}}}
  var map = {$map: {'name': ['value', 'content', 'channel']}}

  return {
    message_meta: function (msg) {
      var chan = msg.value.content.channel
      if (chan)
        return h('a', {href: channelHref(chan)}, '#'+chan)
    },
    screen_view: function (path) {
      if (path === 'groups' && isSsbproSkin()) {
        var groupsWrap = h('div.groups-dashboard')
        var loading = h('div.groups-empty', 'Loading channels...')
        groupsWrap.appendChild(loading)
        var groupsView = h('div.column.scroller', {style: {'overflow': 'auto'}},
          h('div.scroller__wrapper', groupsWrap))
        groupsView.setAttribute('data-icon', 'forum')
        groupsView.title = 'Channels'

        groupsWrap.appendChild(h('section.groups-hero',
          h('div',
            h('h1.groups-hero__title', 'Channels'),
            h('p.groups-hero__copy', 'Public channels and hashtags from your local network.')
          )
        ))

        loadGroupSummaries(function (err, groups) {
          if (loading.parentNode) groupsWrap.removeChild(loading)
          if (err) {
            groupsWrap.appendChild(h('div.groups-empty', err.message))
            return
          }
          var active = groups.filter(function (group) { return group.count > 0 })
          var activeGrid = h('div.groups-grid')
          if (!active.length) activeGrid.appendChild(h('div.groups-empty', 'No channel posts found yet. Start with #intro.'))
          active.slice(0, 30).forEach(function (group) {
            activeGrid.appendChild(groupCard(group))
          })
          groupsWrap.appendChild(h('section.groups-section',
            h('div.groups-section__head',
              h('h2.groups-section__title', 'Active channels'),
              h('span.groups-section__subtitle', 'Recent public channel activity.')
            ),
            activeGrid
          ))
        })
        return groupsView
      }

      if(path[0] === '#' || path.indexOf('channel/') === 0) {
        var channel = groupNameFromRoute(path)
        if (!channel) return

        var content = h('div.column.scroller__content')
        var composerSlot = h('div.channel-compose-slot')
        function renderComposer (initialText) {
          composerSlot.innerHTML = ''
          composerSlot.appendChild(api.message_compose(
            {type: 'post', channel: channel},
            {
              placeholder: 'Post to #' + channel,
              shrink: false,
              initialText: initialText || ''
            }
          ))
        }
        renderComposer('')
        var div = h('div.column.scroller',
          {style: {'overflow':'auto'}},
          h('div.scroller__wrapper',
            isSsbproSkin() ? groupHeader(channel, renderComposer) : null,
            composerSlot,
            content
          )
        )
        div.setAttribute('data-icon', 'forum')
        div.title = '#' + channel

        function matchesChannel(msg) {
          if (msg.sync) console.error('SYNC', msg)
          return matchesGroup(msg, channel)
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

  function groupCard (group) {
    var authors = group.authorOrder.slice(0, 4)
    return h('a.group-card', {href: channelHref(group.name)},
      h('span.group-card__kicker', group.count + (group.count === 1 ? ' post' : ' posts')),
      h('strong.group-card__name', '#' + group.name),
      group.latestText ? h('span.group-card__copy', group.latestText.replace(/\s+/g, ' ').slice(0, 130)) : null,
      authors.length ? h('span.group-card__authors', authors.map(function (id) {
        return api.avatar_image(id, 'thumbnail')
      })) : null
    )
  }

  function groupHeader (channel) {
    return h('section.group-page-head',
      h('div',
        h('a.group-page-head__back', {href: '#groups'}, 'Channels'),
        h('h1.group-page-head__title', '#' + channel),
        h('p.group-page-head__copy', 'Public posts tagged with this channel.')
      )
    )
  }
}
