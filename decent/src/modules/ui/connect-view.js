'use strict'
// Renders the `#connect/<payload>` confirmation screen for ssbpro portable
// Connect codes. Decoding/validation lives in qr-connect.js; this module only
// turns a decoded payload into a confirmation card and publishes a normal
// `contact` follow after explicit user action. The route is inert for clients
// that never generate connect codes, so Decent/ssbski behaviour is unchanged.
var h = require('hyperscript')
var qrConnect = require('./qr-connect')

exports.needs = {
  avatar_image: 'first',
  avatar_name: 'first',
  message_confirm: 'first',
  follower_of: 'first'
}

exports.gives = {
  screen_view: true
}

exports.create = function (api) {
  function errorCard () {
    return h('div.column.scroller', {style: {overflow: 'auto'}},
      h('div.scroller__wrapper',
        h('div.qr-connect-route',
          h('div.qr-connect-route-card',
            h('div.qr-connect-route-title', 'Invalid connect code'),
            h('div.qr-connect-route-sub', 'This link or QR code could not be read.'),
            h('a.btn', {href: '#/'}, 'Back to feed')
          )
        )
      )
    )
  }

  return {
    screen_view: function (route) {
      if (route.indexOf('connect/') !== 0) return
      var payload = qrConnect.decodeConnectPayload(route.slice('connect/'.length))
      if (!payload) return errorCard()

      var selfId = require('../../keys').id
      var feed = payload.feed

      var status = h('div.qr-connect-status')
      var subscribeBtn = h('button.btn.btn-primary', {type: 'button'}, 'Subscribe')

      // Prefer the portable name/bio from the payload, but fall back to whatever
      // this client already knows about the feed.
      var nameEl = payload.name ? h('strong', payload.name) : h('strong', api.avatar_name(feed))
      var bioEl = h('div.qr-connect-route-bio', payload.description || '')
      if (!payload.description) bioEl.style.display = 'none'

      var card = h('div.qr-connect-route-card',
        api.avatar_image(feed, 'thumbnail'),
        nameEl,
        h('div.qr-connect-route-feed', feed),
        bioEl,
        h('div.qr-connect-route-actions',
          subscribeBtn,
          h('a.btn', {href: '#' + feed}, 'View profile')
        ),
        status
      )

      if (feed === selfId) {
        subscribeBtn.disabled = true
        subscribeBtn.textContent = 'This is you'
      } else {
        // Stage 2: don't offer (or publish) a duplicate follow when already subscribed.
        api.follower_of(selfId, feed, function (err, following) {
          if (err || !following) return
          subscribeBtn.disabled = true
          subscribeBtn.textContent = 'Subscribed'
        })
      }

      subscribeBtn.onclick = function () {
        if (subscribeBtn.disabled) return
        subscribeBtn.disabled = true
        api.message_confirm({
          type: 'contact',
          contact: feed,
          following: true
        }, function (err, msg) {
          if (err) {
            subscribeBtn.disabled = false
            status.textContent = err.message
            return
          }
          if (msg) {
            subscribeBtn.textContent = 'Subscribed'
            window.location.hash = '#' + feed
          } else {
            subscribeBtn.disabled = false
          }
        })
      }

      return h('div.column.scroller', {style: {overflow: 'auto'}},
        h('div.scroller__wrapper', h('div.qr-connect-route', card)))
    }
  }
}
