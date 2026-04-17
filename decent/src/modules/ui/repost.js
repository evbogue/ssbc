'use strict'
var h = require('hyperscript')
var renderEmbeddedPost = require('./render-embedded-post')

exports.needs = {
  avatar_image_link: 'first',
  avatar_name:     'first',
  avatar_link:     'first',
  markdown:        'first',
  message_meta:    'map',
  message_confirm: 'first',
  message_link:    'first',
  sbot_get:        'first'
}

exports.gives = {
  message_content: true,
  message_action:  true
}

exports.create = function (api) {
  var x = {}

  function isInteractiveTarget (target, container) {
    while (target && target !== container) {
      var tag = target.tagName
      if (
        tag === 'A' ||
        tag === 'BUTTON' ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'SUMMARY'
      ) return true
      target = target.parentNode
    }
    return false
  }

  function makeCardNavigable (el, targetId) {
    function goToTarget () {
      window.location.hash = '#' + targetId
    }

    el.classList.add('embedded-link-card')
    el.setAttribute('tabindex', '0')
    el.setAttribute('role', 'link')

    el.addEventListener('click', function (ev) {
      if (ev.defaultPrevented) return
      if (ev.button != null && ev.button !== 0) return
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
      if (isInteractiveTarget(ev.target, el)) return
      goToTarget()
    })

    el.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return
      if (isInteractiveTarget(ev.target, el)) return
      ev.preventDefault()
      goToTarget()
    })
  }

  function dispatchQuoteIntent (msg) {
    var ev
    try {
      ev = new CustomEvent('decent:quote', {detail: {msg: msg}, cancelable: true})
    } catch (_) {
      ev = document.createEvent('CustomEvent')
      ev.initCustomEvent('decent:quote', false, true, {msg: msg})
    }
    if (window.dispatchEvent(ev)) {
      try {
        window.sessionStorage.setItem('decent_quote_intent', msg.key)
      } catch (err) {}
      window.location.hash = '#/'
    }
  }

  // Render a repost message in the feed
  x.message_content = function (msg) {
    if (msg.value.content.type !== 'repost') return
    var c = msg.value.content
    if (!c.repost) return

    var inner = h('div.repost-inner', h('em', 'Loading…'))

    // Clicking the card body navigates to the original post's thread.
    // Guard: if the click came from inside an <a> (the author link), let it go.
    inner.addEventListener('click', function (e) {
      var node = e.target
      while (node && node !== inner) {
        if (node.tagName === 'A') return
        node = node.parentNode
      }
      window.location.hash = '#' + c.repost
    })

    api.sbot_get(c.repost, function (err, value) {
      inner.innerHTML = ''
      if (err || !value || !value.content || typeof value.content !== 'object') {
        inner.appendChild(h('em.repost-unavailable', 'Original post not available'))
        return
      }
      var repostedMsg = { key: c.repost, value: value }
      makeCardNavigable(inner, c.repost)
      inner.appendChild(renderEmbeddedPost(api, repostedMsg, 'repost'))
    })

    return h('div.repost-card', inner)
  }

  // Repost + Quote actions on regular posts
  x.message_action = function (msg) {
    var type = msg.value.content.type
    if (type === 'vote' || type === 'repost') return

    // Don't offer Repost or Quote on private messages — Repost would create a
    // public message referencing a private key, and Quote would route to the
    // public composer, both of which could expose private content.
    var isPrivate = msg.value.private ||
      (Array.isArray(msg.value.content.recps) && msg.value.content.recps.length > 0)
    if (isPrivate) return

    var trayOpen = false
    var closeTimer = null
    var hoverTimer = null
    var longPressTimer = null
    var outsideClickFn = null
    var escKeyFn = null

    function sendRepost () {
      api.message_confirm({
        type: 'repost',
        repost: msg.key,
        repostAuthor: msg.value.author
      })
    }

    function openTray () {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
      if (trayOpen) return
      trayOpen = true
      trayEl.classList.add('share-tray--open')

      outsideClickFn = function (e) {
        if (!shareGroup.contains(e.target)) closeTray(true)
      }
      escKeyFn = function (e) {
        if (e.key === 'Escape') closeTray(true)
      }
      document.addEventListener('click', outsideClickFn, true)
      document.addEventListener('keydown', escKeyFn)
    }

    function closeTray (immediate) {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
      if (immediate) {
        if (!trayOpen) return
        trayOpen = false
        trayEl.classList.remove('share-tray--open')
        if (outsideClickFn) {
          document.removeEventListener('click', outsideClickFn, true)
          outsideClickFn = null
        }
        if (escKeyFn) {
          document.removeEventListener('keydown', escKeyFn)
          escKeyFn = null
        }
      } else {
        closeTimer = setTimeout(function () { closeTray(true) }, 180)
      }
    }

    function makeBtn (icon, title, className, handler, inTray) {
      return h('button.action-btn.' + className, {
        type: 'button',
        title: title,
        onclick: function (e) {
          e.preventDefault()
          if (inTray) e.stopPropagation()
          handler()
          closeTray(true)
        }
      }, h('span.material-symbols-outlined.action-icon', icon))
    }

    var repostBtn = makeBtn('repeat', 'Repost', 'action-btn--repost', sendRepost, false)
    var trayEl = h('div.share-tray',
      makeBtn('repeat', 'Repost', 'action-btn--repost', sendRepost, true),
      makeBtn('format_quote', 'Quote', 'action-btn--quote', function () {
        dispatchQuoteIntent(msg)
      }, true)
    )

    trayEl.addEventListener('mouseenter', function () {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
    })
    trayEl.addEventListener('mouseleave', function () { closeTray() })

    var shareGroup = h('div.share-group', repostBtn, trayEl)
    var hasFineMouse = typeof window !== 'undefined' &&
      window.matchMedia && window.matchMedia('(pointer: fine)').matches

    if (hasFineMouse) {
      shareGroup.addEventListener('mouseenter', function () {
        hoverTimer = setTimeout(openTray, 300)
      })
      shareGroup.addEventListener('mouseleave', function () {
        clearTimeout(hoverTimer)
        closeTray()
      })
    }

    shareGroup.addEventListener('touchstart', function () {
      longPressTimer = setTimeout(openTray, 400)
    }, { passive: true })
    shareGroup.addEventListener('touchend', function () {
      clearTimeout(longPressTimer)
    }, { passive: true })
    shareGroup.addEventListener('touchmove', function () {
      clearTimeout(longPressTimer)
    }, { passive: true })

    return shareGroup
  }

  return x
}
