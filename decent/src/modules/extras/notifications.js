'use strict'
var h = require('hyperscript')
var u = require('../../util')
var pull = require('pull-stream')
var Scroller = require('../../scroller')
var paramap = require('pull-paramap')
var plugs = require('../../wire')
var cont = require('cont')
var ref = require('ssb-ref')
var emptyState = require('../../empty-state')

//var message_render = plugs.first(exports.message_render = [])
//var sbot_log = plugs.first(exports.sbot_log = [])
//var sbot_get = plugs.first(exports.sbot_get = [])
//var sbot_user_feed = plugs.first(exports.sbot_user_feed = [])
//var message_unbox = plugs.first(exports.message_unbox = [])

exports.needs = {
  message_render: 'first',
  sbot_log: 'first',
  sbot_get: 'first',
  sbot_user_feed: 'first',
  message_unbox: 'first'
}


exports.gives = {
  builtin_tabs: true,
  screen_view: true,
  notification_filter: true
}

exports.create = function (api) {
  function unbox() {
    return pull(
      pull.map(function (msg) {
        return msg.value && 'string' === typeof msg.value.content ?
          api.message_unbox(msg) : msg
      }),
      pull.filter(Boolean)
    )
  }

  function notifications(ourIds) {

    function linksToUs(link) {
      return link && link.link in ourIds
    }

    function isOurMsg(id, cb) {
      if (!id) return cb(null, false)
      if (typeof id === 'object' && typeof id.link === 'string') id = id.link
      if (!ref.isMsg(id)) return cb(null, false)
      api.sbot_get(id, function (err, msg) {
        if (err && err.name == 'NotFoundError') cb(null, false)
        else if (err) cb(err)
        else if (msg.content.type === 'issue' || msg.content.type === 'pull-request')
          isOurMsg(msg.content.repo || msg.content.project, cb)
        else cb(err, msg.author in ourIds)
      })
    }

    function isAnyOurMessage(msg, ids, cb) {
      cont.para(ids.map(function (id) {
        return function (cb) { isOurMsg(id, cb) }
      }))
      (function (err, results) {
        if (err) cb(err)
        else if (results.some(Boolean)) cb(null, msg)
        else cb()
      })
    }

    return paramap(function (msg, cb) {
      var c = msg.value && msg.value.content
      if (!c || typeof c !== 'object') return cb()
      if (msg.value.author in ourIds) return cb()

      if (c.mentions && Array.isArray(c.mentions) && c.mentions.some(linksToUs))
        return cb(null, msg)

      if (msg.private)
        return cb(null, msg)

      switch (c.type) {
        case 'post':
          if (c.branch || c.root)
            return isAnyOurMessage(msg, [].concat(c.branch, c.root), cb)
          else return cb()

        case 'contact':
          return cb(null, c.contact in ourIds ? msg : null)

        case 'vote':
          if (c.vote && c.vote.link)
            return isOurMsg(c.vote.link, function (err, isOurs) {
              cb(err, isOurs ? msg : null)
            })
            else return cb()

        case 'issue':
        case 'pull-request':
          return isOurMsg(c.project || c.repo, function (err, isOurs) {
            cb(err, isOurs ? msg : null)
          })

        case 'issue-edit':
          return isAnyOurMessage(msg, [c.issue].concat(c.issues), cb)

        case 'git-update':
          return isOurMsg(c.repo, function (err, isOurs) {
            cb(err, isOurs ? msg : null)
          })

        case 'git-comment':
          return isOurMsg(c.repo, function (err, isOurs) {
            cb(err, isOurs ? msg : null)
          })

        default:
          cb()
      }
    }, 4)
  }

  function getFirstMessage(feedId, cb) {
    api.sbot_user_feed({id: feedId, gte: 0, limit: 1})(null, cb)
  }

  return {
    notification_filter: notifications,

    builtin_tabs: function () {
      return ['notifications']
    },

    screen_view: function (path) {
      if(path === 'notifications') {
        var ids = {}
        var oldest

        var id = require('../../keys').id
        ids[id] = true
        getFirstMessage(id, function (err, msg) {
          if (err && err !== true) return console.error(err)
          if (!msg || !msg.value) return
          if (!oldest || msg.value.timestamp < oldest) {
            oldest = msg.value.timestamp
          }
        })

        var content = h('div.column.scroller__content')
        var div = h('div.column.scroller',
          {style: {'overflow':'auto'}},
          h('div.scroller__wrapper',
            content
          )
        )
        div.setAttribute('data-icon', 'notifications')

        // Offer native foreground notifications behind an explicit opt-in.
        // Never prompt on load; browsers require this to follow a user gesture.
        if (typeof window !== 'undefined' && 'Notification' in window) {
          var banner = h('div.notify-permission')
          var isSsbski = !!document.querySelector('link[rel="stylesheet"][href*="ssbski-style.css"]')
          var icon = isSsbski ? '/icons/ssbski-192.png' : '/icons/decent-192.png'
          var deliveryStatus = h('span.notify-permission__status')

          function setDeliveryStatus(message, isError) {
            deliveryStatus.textContent = message
            deliveryStatus.className = 'notify-permission__status' +
              (isError ? ' notify-permission__status--error' : '')
          }

          function renderNotificationCard(iconName, title, description, action) {
            banner.innerHTML = ''
            banner.appendChild(h('span.material-symbols-outlined.notify-permission__icon',
              {'aria-hidden': 'true'}, iconName))
            banner.appendChild(h('div.notify-permission__body',
              h('strong.notify-permission__title', title),
              h('span.notify-permission__description', description),
              deliveryStatus
            ))
            if (action) banner.appendChild(h('div.notify-permission__actions', action))
          }

          function primaryButton(label, onclick) {
            return h('button.btn.btn-primary.notify-permission__action',
              {type: 'button', onclick: onclick}, label)
          }

          function showTestNotification() {
            var opts = {
              body: 'Desktop notifications are working. New activity will appear like this while the app is open.',
              icon: icon,
              data: { route: '#notifications' }
            }
            setDeliveryStatus('Sending test popup…')
            try {
              var notification = new Notification('Test notification', opts)
              notification.onclick = function () {
                window.focus()
                window.location.hash = '#notifications'
              }
              setDeliveryStatus('Test popup sent. If it is not visible, check your operating system notification settings.')
            } catch (err) {
              if (!navigator.serviceWorker || !navigator.serviceWorker.ready) {
                setDeliveryStatus('Test popup failed: ' + (err.message || err), true)
                return
              }
              navigator.serviceWorker.ready.then(function (registration) {
                return registration.showNotification('Test notification', opts)
              }).then(function () {
                setDeliveryStatus('Test popup sent. If it is not visible, check your operating system notification settings.')
              }).catch(function (swErr) {
                setDeliveryStatus('Test popup failed: ' + (swErr.message || swErr), true)
              })
            }
          }

          var renderBanner = function () {
            setDeliveryStatus('')
            if (Notification.permission === 'granted') {
              banner.style.display = ''
              renderNotificationCard(
                'notifications_active',
                'Desktop notifications are on',
                'New activity will appear as a popup while this app is open.',
                primaryButton('Send test notification', showTestNotification)
              )
              return
            }
            if (Notification.permission === 'denied') {
              banner.style.display = ''
              renderNotificationCard(
                'notifications_off',
                'Desktop notifications are blocked',
                'Enable notifications for this site in your browser settings, then reload.'
              )
              return
            }
            banner.style.display = ''
            renderNotificationCard(
              'notifications',
              'Never miss new activity',
              'Get desktop popups for mentions, replies, likes, follows, and git activity.',
              primaryButton('Enable notifications', function () {
                  Notification.requestPermission().then(renderBanner, renderBanner)
                })
            )
          }
          renderBanner()
          content.appendChild(banner)
        }

        emptyState(content, {
          icon: 'notifications',
          title: 'No notifications yet',
          body: 'Replies, likes, and follows will show up here.'
        })

        pull(
          u.next(api.sbot_log, {old: false, limit: 100}),
          unbox(),
          notifications(ids),
          pull.filter(),
          Scroller(div, content, api.message_render, true, false)
        )

        pull(
          u.next(api.sbot_log, {reverse: true, limit: 100, live: false}),
          unbox(),
          notifications(ids),
          pull.filter(),
          pull.take(function (msg) {
            // abort stream after we pass the oldest messages of our feeds
            return !oldest ? true : msg.value.timestamp > oldest
          }),
          Scroller(div, content, api.message_render, false, false)
        )

        return div
      }
    }
  }
}
