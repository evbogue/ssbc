var h = require('hyperscript')
var u = require('../../util')
var pull = require('pull-stream')

//var plugs = require('../../wire')
//
//var message_content = plugs.first(exports.message_content = [])
//var message_content_mini = plugs.first(exports.message_content_mini = [])
//
//var avatar = plugs.first(exports.avatar = [])
//var avatar_name = plugs.first(exports.avatar_name = [])
//var avatar_link = plugs.first(exports.avatar_link = [])
//var message_meta = plugs.map(exports.message_meta = [])
//var message_action = plugs.map(exports.message_action = [])
//var message_link = plugs.first(exports.message_link = [])
//
//var sbot_links = plugs.first(exports.sbot_links = [])

exports.needs = {
  message_content: 'first',
  message_content_mini: 'first',
  avatar: 'first',
  avatar_name: 'first',
  avatar_link: 'first',
  message_meta: 'map',
  message_action: 'map',
  message_reactions: 'map',
  message_link: 'first',
//  sbot_links: 'first'
}

exports.gives = 'message_render'

function message_content_mini_fallback(msg)  {
  return h('code', msg.value.content.type)
}

function isRenderableMessage (msg) {
  return !!(
    msg &&
    msg.value &&
    msg.value.content &&
    typeof msg.value.content === 'object'
  )
}

exports.create = function (api) {
  function getCache () {
    return typeof window !== 'undefined' && window.CACHE ? window.CACHE : {}
  }

  function mini(msg, el) {
    var content = el
    if(content && content.nodeType === 1)
      content.classList.add('message_content')
    else
      content = h('span.message_content', el)

    var div = h('div.message.message--mini.message-card.row',
      api.avatar_link(msg.value.author, api.avatar_name(msg.value.author)),
      content,
      h('span.message_meta.row', api.message_meta(msg)),
      api.message_reactions(msg)
    )
    div.setAttribute('tabindex', '0')
    return div
  }

  // Double-tap-to-heart gesture for touch devices (Stage 7 item 1).
  function wireDoubleTapHeart (msgEl, content) {
    if (typeof window === 'undefined') return
    var lastTap = 0
    content.addEventListener('touchend', function (ev) {
      // Leave real interactions alone.
      if (ev.target.closest &&
          ev.target.closest('a, button, input, textarea, select, ' +
            'img, video, audio, iframe, .emoji, .reaction-pill')) {
        lastTap = 0
        return
      }
      var now = Date.now()
      if (now - lastTap < 300) {
        lastTap = 0
        var heart = msgEl.querySelector('.reaction-group .action-btn--react')
        if (heart && !heart.classList.contains('action-btn--reacted')) {
          heart.click()
        }
        var t = ev.changedTouches && ev.changedTouches[0]
        if (t) spawnHeartBurst(t.clientX, t.clientY)
      } else {
        lastTap = now
      }
    }, { passive: true })
  }

  function spawnHeartBurst (x, y) {
    if (typeof document === 'undefined') return
    var burst = h('div.reaction-heart-burst', '❤️')
    burst.style.left = x + 'px'
    burst.style.top = y + 'px'
    document.body.appendChild(burst)
    burst.addEventListener('animationend', function () {
      if (burst.parentNode) burst.parentNode.removeChild(burst)
    })
  }

  // Collapse long posts by default (tweet-sized), with a "Show more" toggle
  // that reveals the full body. The CSS clamps .collapsible to a fixed height;
  // here we decide whether the post is actually tall enough to need the toggle
  // and only then surface the button + fade. Git pushes, stories, and any other
  // long content all flow through here via .message_content.
  function makeExpander () {
    return h('button.message-expand', {type: 'button', 'aria-expanded': 'false'},
      h('span.message-expand__label', 'Show more'))
  }

  function wireCollapse (content, expandBtn) {
    if (typeof window === 'undefined') return
    content.classList.add('collapsible')
    var label = expandBtn.firstChild
    var expanded = false

    function update () {
      if (expanded) return
      var over = content.scrollHeight > content.clientHeight + 4
      content.classList.toggle('is-overflowing', over)
    }

    expandBtn.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      expanded = !expanded
      content.classList.toggle('collapsible--expanded', expanded)
      expandBtn.setAttribute('aria-expanded', String(expanded))
      label.textContent = expanded ? 'Show less' : 'Show more'
      if (!expanded) {
        update()
        content.scrollIntoView({block: 'nearest'})
      }
    })

    // A ResizeObserver fires once the card is actually laid out (cards may be
    // built offscreen, where an eager measurement would read 0 height) and
    // again whenever it becomes visible or reflows — re-measuring each time.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(update).observe(content)
    } else {
      requestAnimationFrame(function () { requestAnimationFrame(update) })
      setTimeout(update, 300)
    }

    // Embedded images grow scrollHeight without resizing the clamped box, so
    // the observer won't catch them — re-measure as each one loads.
    requestAnimationFrame(function settle () {
      if (!content.isConnected) return requestAnimationFrame(settle)
      var imgs = content.querySelectorAll('img')
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].complete) continue
        imgs[i].addEventListener('load', update)
        imgs[i].addEventListener('error', update)
      }
    })
  }

  return function (msg, sbot) {
    if (!isRenderableMessage(msg)) return null

    var el = api.message_content_mini(msg)
    if(el) return mini(msg, el)

    var el = api.message_content(msg)
    if(!el) return mini(msg, message_content_mini_fallback(msg))

    var links = []
    var cache = getCache()
    for(var k in cache) {
      var _msg = cache[k]
      var mentions = _msg && _msg.content && _msg.content.mentions
      if(Array.isArray(mentions)) {
        for(var i = 0; i < mentions.length; i++)
          if(mentions[i].link == msg.key)
          links.push(k)
      }
    }

    var backlinks = h('div.backlinks')
    if(links.length)
      backlinks.appendChild(h('label', 'backlinks:', 
        h('div', links.map(function (key) {
          return api.message_link(key)
        }))
      ))


  //  pull(
  //    sbot_links({dest: msg.key, rel: 'mentions', keys: true}),
  //    pull.collect(function (err, links) {
  //      if(links.length)
  //        backlinks.appendChild(h('label', 'backlinks:', 
  //          h('div', links.map(function (link) {
  //            return message_link(link.key)
  //          }))
  //        ))
  //    })
  //  )

    var content = el
    if(content && content.nodeType === 1)
      content.classList.add('message_content')
    else
      content = h('div.message_content', el)

    var replyLink = h('button.action-btn.action-btn--reply', {type: 'button', title: 'Reply'})
    replyLink.appendChild(h('span.material-symbols-outlined.action-icon', 'chat_bubble'))
    replyLink.addEventListener('click', function () {
      var event
      try {
        event = new CustomEvent('decent:reply', {detail: {msg: msg}, cancelable: true})
      } catch (err) {
        event = document.createEvent('CustomEvent')
        event.initCustomEvent('decent:reply', false, true, {msg: msg})
      }
      if (window.dispatchEvent(event)) {
        try {
          window.sessionStorage.setItem('decent_reply_intent', msg.key)
        } catch (err) {}
        window.location.hash = '#' + msg.key
      }
    })

    var expandBtn = makeExpander()

    var msgEl = h('div.message.message-card',
      h('div.title.row',
        h('div.avatar', api.avatar(msg.value.author, 'thumbnail')),
        h('div.message_meta.row', api.message_meta(msg))
      ),
      content,
      expandBtn,
      h('div.message_actions.row',
        h('div.actions', replyLink, api.message_action(msg), api.message_reactions(msg))
      ),
      backlinks,
      {onkeydown: function (ev) {
        // never hijack typing in a field
        if (ev.target.nodeName === 'INPUT'
          || ev.target.nodeName === 'TEXTAREA') return

        //on enter, hit first meta.
        if(ev.keyCode == 13) {
          msgEl.querySelector('.enter').click()
          return
        }

        // "r" opens the reaction picker for the focused post (Stage 7 item 2).
        // Escape is handled by the picker's own outside/esc listener.
        if ((ev.keyCode === 82 || ev.key === 'r') && !ev.metaKey
            && !ev.ctrlKey && !ev.altKey) {
          var trigger = msgEl.querySelector('.reaction-picker-trigger')
          if (trigger) {
            ev.preventDefault()
            trigger.click()
          }
        }
      }}
    )

    // ); hyperscript does not seem to set attributes correctly.
    msgEl.setAttribute('tabindex', '0')

    // ── Double-tap to ❤️ (Stage 7 item 1) ──────────────────────────────────
    // On touch, two quick taps on the post body cast a heart, with a floating
    // burst at the tap point. Suppressed over links/buttons/media/emoji so it
    // never fights a real interaction, and a no-op if already reacted.
    wireDoubleTapHeart(msgEl, content)

    // ── Collapse long posts by default (Twitter-style) ─────────────────────
    wireCollapse(content, expandBtn)

    return msgEl
  }
}
