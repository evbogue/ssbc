'use strict'
// Minimal foreground browser notifications for ssbski: ping the user when a new
// mention or private message arrives while an ssbski tab is open. No service
// worker, no manifest, no push server — just the Notification API driven by the
// same live log + unbox plumbing the notifications tab already uses.
//
// Scope is deliberately tiny: only mentions-of-us and private messages, which
// are the two cases the classifier in notifications.js can decide synchronously
// (no sbot_get round-trips). Everything else (votes/follows/replies/git) is out.
var pull = require('pull-stream')
var u = require('../../util')
var keys = require('../../keys')

exports.needs = {
  sbot_log: 'first',
  message_unbox: 'first'
}

exports.gives = {
  notify_start: true
}

exports.create = function (api) {
  return {
    notify_start: function () {
      // ssbski skin only, and only where the Notification API exists.
      var isSsbski = typeof document !== 'undefined' &&
        !!document.querySelector('link[rel="stylesheet"][href*="ssbski-style.css"]')
      if (!isSsbski) return
      if (typeof window === 'undefined' || !('Notification' in window)) return

      var ourId = keys.id
      // Only notify for messages that arrive after the app opened, so a reconnect
      // or backfill never replays a burst of already-seen history.
      var openedAt = Date.now()
      var seen = {}

      function unbox(msg) {
        return msg.value && typeof msg.value.content === 'string'
          ? api.message_unbox(msg) : msg
      }

      pull(
        u.next(api.sbot_log, {old: false, limit: 100}),
        pull.drain(function (raw) {
          if (raw.sync) return
          if (Notification.permission !== 'granted') return
          // Don't ping the tab the user is already looking at.
          if (!document.hidden && document.hasFocus && document.hasFocus()) return

          var msg = unbox(raw)
          if (!msg) return
          var v = msg.value
          var c = v && v.content
          if (!c || typeof c !== 'object') return       // still-encrypted or junk
          if (v.author === ourId) return                // never our own messages
          if (seen[msg.key]) return

          var arrived = msg.timestamp || v.timestamp || 0
          if (arrived <= openedAt) return

          var isPrivate = v.private === true
          var isMention = !isPrivate &&
            Array.isArray(c.mentions) &&
            c.mentions.some(function (l) { return l && l.link === ourId })
          if (!isPrivate && !isMention) return

          seen[msg.key] = true
          var body = typeof c.text === 'string' ? c.text.slice(0, 140) : ''
          var n = new Notification(
            isPrivate ? 'New private message' : 'You were mentioned',
            { body: body, tag: msg.key, icon: '/ssbski-logo.png' }
          )
          n.onclick = function () {
            window.focus()
            window.location.hash = '#' + msg.key
          }
        }, function (err) {
          if (err && err !== true) console.error('notify stream ended:', err)
        })
      )
    }
  }
}
