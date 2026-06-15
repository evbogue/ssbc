'use strict'
// Foreground browser notifications for both skins. The app must be open, but it
// may be backgrounded or minimized. The shared notification_filter decides
// which events target us, keeping this emitter aligned with the in-app tab.
var pull = require('pull-stream')
var u = require('../../util')
var keys = require('../../keys')

exports.needs = {
  sbot_log: 'first',
  message_unbox: 'first',
  notification_filter: 'first'
}

exports.gives = {
  notify_start: true
}

exports.create = function (api) {
  function notificationDetails(msg, ourId) {
    var c = msg.value.content
    var title = 'New activity'
    if (msg.private) title = 'New private message'
    else if (Array.isArray(c.mentions) && c.mentions.some(function (link) {
      return link && link.link === ourId
    })) title = 'You were mentioned'
    else if (c.type === 'post') title = 'New reply'
    else if (c.type === 'contact') title = 'New follower'
    else if (c.type === 'vote') title = 'New reaction'
    else if (c.type === 'issue') title = 'New issue'
    else if (c.type === 'pull-request') title = 'New pull request'
    else if (c.type === 'issue-edit') title = 'Issue updated'
    else if (c.type === 'git-update') title = 'Repository updated'
    else if (c.type === 'git-comment') title = 'New git comment'
    return {
      title: title,
      body: typeof c.text === 'string' ? c.text.slice(0, 140) : '',
      route: '#' + msg.key
    }
  }

  return {
    notify_start: function () {
      if (typeof window === 'undefined' || !('Notification' in window)) return

      var ourId = keys.id
      var ourIds = {}
      ourIds[ourId] = true
      var isSsbski = !!document.querySelector('link[rel="stylesheet"][href*="ssbski-style.css"]')
      var skin = isSsbski ? 'ssbski' : 'decent'
      var icon = isSsbski ? '/icons/ssbski-192.png' : '/icons/decent-192.png'
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
        pull.map(unbox),
        pull.filter(Boolean),
        api.notification_filter(ourIds),
        pull.filter(Boolean),
        pull.drain(function (raw) {
          if (raw.sync) return
          if (Notification.permission !== 'granted') return

          var msg = raw
          var v = msg.value
          if (seen[msg.key]) return

          var arrived = msg.timestamp || v.timestamp || 0
          if (arrived <= openedAt) return

          seen[msg.key] = true
          var details = notificationDetails(msg, ourId)
          var opts = {
            body: details.body,
            tag: skin + ':' + msg.key,
            icon: icon,
            data: { route: details.route }
          }

          showDesktopNotification(details, opts)
        }, function (err) {
          if (err && err !== true) console.error('notify stream ended:', err)
        })
      )

      function showDesktopNotification(details, opts) {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(function (registration) {
            return registration.showNotification(details.title, opts)
          }).catch(function (swErr) {
            console.error('desktop notification failed:', swErr)
          })
          return
        }
        try {
          var n = new Notification(details.title, opts)
          n.onclick = function () {
            window.focus()
            window.location.hash = details.route
          }
        } catch (err) {
          console.error('desktop notification failed:', err)
        }
      }
    }
  }
}
