'use strict'
// ssbpro-only "Network" tab: a people/bio discovery dashboard instead of the
// generic following feed. Registered before public.js so its screen_view wins
// for the ssbpro skin; it returns undefined for other skins/routes so Decent
// and ssbski keep public.js's behaviour unchanged. No new SSB message types —
// everything is derived from existing contact/about/post data and a Subscribe
// still publishes a normal `contact` follow.
var h = require('hyperscript')
var pull = require('pull-stream')
var keys = require('../../keys')

exports.needs = {
  avatar_image: 'first',
  avatar_name: 'first',
  message_confirm: 'first',
  follower_of: 'first',
  sbot_messagesByType: 'first',
  sbot_log: 'first'
}

exports.gives = {
  screen_view: true
}

exports.create = function (api) {
  var selfId = keys.id

  function isSsbproSkin () {
    return !!document.querySelector('link[rel="stylesheet"][href*="ssbpro-style.css"]')
  }

  // Follow relationships, derived in stream order (last write wins) the same way
  // public.js builds its author set, so blocks/unfollows are respected.
  function loadRelations (cb) {
    pull(
      api.sbot_messagesByType({type: 'contact', old: true, live: false}),
      pull.collect(function (err, msgs) {
        if (err) return cb(err)
        var youFollow = {}
        var followsYou = {}
        ;(msgs || []).forEach(function (m) {
          var v = m && m.value
          var c = v && v.content
          if (!c || c.type !== 'contact' || typeof c.contact !== 'string') return
          var following = c.following === true && !c.blocking
          if (v.author === selfId) {
            if (following) youFollow[c.contact] = true
            else delete youFollow[c.contact]
          }
          if (c.contact === selfId) {
            if (following) followsYou[v.author] = true
            else delete followsYou[v.author]
          }
        })
        delete youFollow[selfId]
        delete followsYou[selfId]
        cb(null, {youFollow: youFollow, followsYou: followsYou})
      })
    )
  }

  // Latest about.description per feed (stream order, last write wins).
  function loadBios (cb) {
    pull(
      api.sbot_messagesByType({type: 'about', old: true, live: false}),
      pull.collect(function (err, msgs) {
        if (err) return cb(err)
        var bios = {}
        ;(msgs || []).forEach(function (m) {
          var v = m && m.value
          var c = v && v.content
          if (!c || c.about == null || typeof c.description !== 'string') return
          bios[c.about] = c.description.trim()
        })
        cb(null, bios)
      })
    )
  }

  // Recent public posters, most active first, excluding self.
  function loadActive (cb) {
    pull(
      api.sbot_log({reverse: true, limit: 400, old: true, live: false}),
      pull.collect(function (err, msgs) {
        if (err) return cb(err)
        var counts = {}
        var order = []
        ;(msgs || []).forEach(function (m) {
          var v = m && m.value
          var c = v && v.content
          if (!v || typeof v.author !== 'string') return
          if (v.author === selfId) return
          if (!c || typeof c !== 'object' || c.type !== 'post') return
          if (c.recps || c.private) return
          if (!counts[v.author]) order.push(v.author)
          counts[v.author] = counts[v.author] + 1 || 1
        })
        order.sort(function (a, b) { return counts[b] - counts[a] })
        cb(null, order)
      })
    )
  }

  function hasUsefulBio (text) {
    return typeof text === 'string' && text.trim().length >= 12
  }

  return {
    screen_view: function (path) {
      if (path !== 'friends') return
      // Let public.js render the standard following feed for Decent/ssbski.
      if (!isSsbproSkin()) return

      var sections = h('div.network-discovery')
      var loading = h('div.network-empty', 'Loading your network…')
      sections.appendChild(loading)
      var outer = h('div.column.scroller', {style: {overflow: 'auto'}},
        h('div.scroller__wrapper', sections))
      outer.setAttribute('data-icon', 'groups')
      outer.title = 'Network'

      var data = {rel: {youFollow: {}, followsYou: {}}, bios: {}, active: []}
      var pending = 3
      function done () {
        if (--pending > 0) return
        if (loading.parentNode) sections.removeChild(loading)
        render()
      }
      loadRelations(function (err, rel) { if (rel) data.rel = rel; done() })
      loadBios(function (err, bios) { if (bios) data.bios = bios; done() })
      loadActive(function (err, active) { if (active) data.active = active; done() })

      function relationOf (id) {
        var yf = data.rel.youFollow[id]
        var fy = data.rel.followsYou[id]
        if (yf && fy) return 'Mutual subscription'
        if (yf) return 'Subscribed'
        if (fy) return 'Subscribes to you'
        return 'Not connected yet'
      }

      function personCard (id) {
        var subscribeBtn = h('button.btn.btn-primary.network-card__subscribe', {type: 'button'}, 'Subscribe')
        function markSubscribed () {
          subscribeBtn.disabled = true
          subscribeBtn.textContent = 'Subscribed'
        }
        if (data.rel.youFollow[id]) markSubscribed()
        else {
          api.follower_of(selfId, id, function (e, f) { if (!e && f) markSubscribed() })
        }
        subscribeBtn.onclick = function () {
          if (subscribeBtn.disabled) return
          subscribeBtn.disabled = true
          api.message_confirm({type: 'contact', contact: id, following: true}, function (err, msg) {
            if (err) { subscribeBtn.disabled = false; return }
            if (msg) { subscribeBtn.textContent = 'Subscribed'; data.rel.youFollow[id] = true }
            else subscribeBtn.disabled = false
          })
        }

        var bio = data.bios[id]
        return h('div.network-card',
          h('a.network-card__avatar', {href: '#' + id}, api.avatar_image(id, 'thumbnail')),
          h('div.network-card__body',
            h('a.network-card__name', {href: '#' + id}, api.avatar_name(id)),
            h('div.network-card__relation', relationOf(id)),
            bio ? h('div.network-card__bio', bio) : null,
            h('div.network-card__actions',
              subscribeBtn,
              h('a.btn', {href: '#dm/' + id}, 'Message'),
              h('a.btn', {href: '#' + id}, 'View profile')
            )
          )
        )
      }

      function section (title, subtitle, ids, emptyText) {
        var grid = h('div.network-grid')
        if (!ids.length) grid.appendChild(h('div.network-empty', emptyText))
        else ids.forEach(function (id) { grid.appendChild(personCard(id)) })
        return h('section.network-section',
          h('div.network-section__head',
            h('h2.network-section__title', title),
            subtitle ? h('div.network-section__subtitle', subtitle) : null
          ),
          grid
        )
      }

      function render () {
        var youFollow = Object.keys(data.rel.youFollow)
        var followsYou = Object.keys(data.rel.followsYou)
        var active = data.active.filter(function (id) { return id !== selfId }).slice(0, 12)

        if (!hasUsefulBio(data.bios[selfId])) {
          sections.appendChild(h('section.network-section',
            h('div.network-cta',
              h('div',
                h('h2.network-section__title', 'Your bio needs work'),
                h('div.network-section__subtitle',
                  'A clear bio helps people decide to subscribe. Add one to your profile, then share it with Connect.')
              ),
              h('a.btn.btn-primary', {href: '#' + selfId}, 'Improve your bio')
            )
          ))
        }

        sections.appendChild(section(
          'People you subscribe to', 'Your subscriptions',
          youFollow.slice(0, 60),
          'You have not subscribed to anyone yet. Use Connect to add people.'))
        sections.appendChild(section(
          'People subscribed to you', 'Your audience',
          followsYou.slice(0, 60),
          'No one is subscribed to you yet. Share your profile with Connect.'))
        sections.appendChild(section(
          'Active people', 'Recently posting on your local network',
          active,
          'No recent activity yet.'))
      }

      return outer
    }
  }
}
