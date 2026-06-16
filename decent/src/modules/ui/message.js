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
  function isSsbski () {
    return typeof document !== 'undefined' &&
      !!document.querySelector('link[rel="stylesheet"][href*="ssbski-style.css"]')
  }

  function shortFeedId (id) {
    if (!id) return ''
    return id.substring(0, 10)
  }

  function postUrl (msg) {
    if (typeof window === 'undefined') return msg.key
    return window.location.origin + window.location.pathname + '#' + msg.key
  }

  function copyText (text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
      return
    }
    var input = document.createElement('textarea')
    input.value = text
    input.setAttribute('readonly', 'readonly')
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }

  var savedKey = 'ssbski:saved-posts'
  function getSavedPosts () {
    if (typeof window === 'undefined' || !window.localStorage) return {}
    try {
      return JSON.parse(window.localStorage.getItem(savedKey) || '{}') || {}
    } catch (err) {
      return {}
    }
  }

  function setSavedPost (key, saved) {
    if (typeof window === 'undefined' || !window.localStorage) return
    var savedPosts = getSavedPosts()
    if (saved) savedPosts[key] = true
    else delete savedPosts[key]
    window.localStorage.setItem(savedKey, JSON.stringify(savedPosts))
  }

  function makeIconButton (icon, title, className) {
    var btn = h('button.action-btn.' + className, {type: 'button', title: title},
      h('span.material-symbols-outlined.action-icon', {'aria-hidden': 'true'}, icon))
    btn.setAttribute('aria-label', title)
    return btn
  }

  function makeMoreMenu (msg, menu, moreBtn) {
    function close () {
      menu.classList.remove('message-more-menu--open')
      moreBtn.setAttribute('aria-expanded', 'false')
      document.removeEventListener('click', close)
    }
    function item (label, action) {
      return h('button.message-more-menu__item', {type: 'button', onclick: function (ev) {
        ev.preventDefault()
        ev.stopPropagation()
        action()
        close()
      }}, label)
    }
    menu.appendChild(item('Copy message key', function () { copyText(msg.key) }))
    menu.appendChild(item('Copy link', function () { copyText(postUrl(msg)) }))
    menu.appendChild(item('View thread', function () { window.location.hash = '#' + msg.key }))
    return close
  }

  // Toggle a post card between its rendered body and the raw {key, value}
  // JSON. We stash the rendered children aside and swap a <pre> in their place,
  // so flipping back is lossless (and keeps any wired-up event handlers).
  function makeRawToggle (msg, content) {
    var rawBtn = makeIconButton('data_object', 'View raw', 'action-btn--raw')
    var stash = h('div')
    var pre = null
    var showingRaw = false
    rawBtn.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      showingRaw = !showingRaw
      // Raw view is the whole object — opt out of the "Show more" clamp while
      // it's up (the .showing-raw class also tells wireCollapse's observer to
      // stop re-applying a max-height).
      content.classList.toggle('showing-raw', showingRaw)
      if (showingRaw) {
        if (!pre) {
          pre = h('pre.message_raw',
            h('code', JSON.stringify({key: msg.key, value: msg.value}, null, 2)))
        }
        var node
        while ((node = content.firstChild)) stash.appendChild(node)
        content.appendChild(pre)
        content.classList.remove('is-overflowing')
        content.style.maxHeight = ''
      } else {
        if (pre && pre.parentNode === content) content.removeChild(pre)
        var back
        while ((back = stash.firstChild)) content.appendChild(back)
      }
      rawBtn.classList.toggle('action-btn--raw-on', showingRaw)
      rawBtn.setAttribute('aria-pressed', showingRaw ? 'true' : 'false')
      rawBtn.title = showingRaw ? 'View rendered' : 'View raw'
      rawBtn.setAttribute('aria-label', rawBtn.title)
    })
    return rawBtn
  }

  function makeExtraActions (msg, content) {
    var isSaved = !!getSavedPosts()[msg.key]
    var rawBtn = makeRawToggle(msg, content)
    var saveBtn = makeIconButton('bookmark', 'Save post', 'action-btn--save')
    var shareBtn = makeIconButton('ios_share', 'Copy post link', 'action-btn--share')
    var moreBtn = makeIconButton('more_horiz', 'More', 'action-btn--more')
    var menu = h('div.message-more-menu')
    var closeMore = makeMoreMenu(msg, menu, moreBtn)

    function renderSaved () {
      saveBtn.classList.toggle('action-btn--saved', isSaved)
      saveBtn.setAttribute('aria-pressed', isSaved ? 'true' : 'false')
      saveBtn.title = isSaved ? 'Remove saved post' : 'Save post'
      saveBtn.setAttribute('aria-label', saveBtn.title)
    }

    renderSaved()
    saveBtn.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      isSaved = !isSaved
      setSavedPost(msg.key, isSaved)
      renderSaved()
    })
    shareBtn.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      copyText(postUrl(msg))
    })
    moreBtn.setAttribute('aria-haspopup', 'menu')
    moreBtn.setAttribute('aria-expanded', 'false')
    moreBtn.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      var open = !menu.classList.contains('message-more-menu--open')
      if (open) {
        menu.classList.add('message-more-menu--open')
        moreBtn.setAttribute('aria-expanded', 'true')
        setTimeout(function () { document.addEventListener('click', closeMore) }, 0)
      } else {
        closeMore()
      }
    })

    return h('div.message_actions_extra', rawBtn, saveBtn, shareBtn, h('span.message-more-wrap', moreBtn, menu))
  }

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

  // Click-anywhere-on-card to open the thread (Bluesky-style). Scoped to the
  // ssbski skin's feed cards; the dedicated thread page renders posts with
  // {full:true} and opts out (you're already in that thread). Keyboard users
  // get the same via the card's tabindex + Enter handler (clicks .enter).
  function wireCardClick (msgEl, msg) {
    if (typeof window === 'undefined') return
    msgEl.addEventListener('click', function (ev) {
      // Honour modifier-clicks / non-primary buttons and already-handled clicks.
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey ||
          ev.shiftKey || ev.altKey) return
      // Leave real interactions alone: links, buttons, fields, media, the
      // action row, and the reaction/more UI all handle their own clicks.
      if (ev.target.closest && ev.target.closest(
          'a, button, input, textarea, select, label, img, video, audio, iframe, ' +
          '.message_actions, .reaction-pill, .reaction-tray, .reaction-picker, ' +
          '.reaction-popover, .message-more-menu, .backlinks')) return
      // Don't yank the reader into the thread mid-text-selection.
      var sel = window.getSelection && window.getSelection()
      if (sel && String(sel)) return
      window.location.hash = '#' + msg.key
    })
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
      h('span.message-expand__label', 'Show more'),
      h('span.message-expand__icon.material-symbols-outlined', {'aria-hidden': 'true'}, 'expand_more'))
  }

  function wireCollapse (content, expandBtn) {
    if (typeof window === 'undefined') return
    content.classList.add('collapsible')
    var label = expandBtn.firstChild
    var expanded = false

    // The CSS clamp is a fixed pixel height, but a card mixes rows of different
    // heights (badges, commit meta, body text), so that height almost never
    // lands on a body-text line boundary — it slices a row in half and you see
    // the tops of letters at the cut. Given the clamp height, find the tallest
    // height that doesn't bisect any text line: the top of the first text run
    // that crosses the clamp. Returns the clamp unchanged if nothing straddles.
    function snapHeight (capPx) {
      var top = content.getBoundingClientRect().top
      var cap = top + capPx
      var snap = capPx
      var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null)
      var node
      while ((node = walker.nextNode())) {
        if (!node.textContent || !node.textContent.trim()) continue
        var rects = document.createRange()
        rects.selectNodeContents(node)
        rects = rects.getClientRects()
        for (var i = 0; i < rects.length; i++) {
          var r = rects[i]
          if (r.top < cap - 0.5 && r.bottom > cap + 0.5 && r.top - top < snap)
            snap = r.top - top
        }
      }
      return Math.max(0, Math.floor(snap))
    }

    var clampPx = null // the CSS clamp height (.collapsible max-height), cached once

    function update () {
      if (expanded || content.classList.contains('showing-raw')) return
      // Read the CSS clamp once, before we ever apply an inline cap (after which
      // getComputedStyle would echo our own value back). It's a constant.
      if (clampPx == null) {
        var css = parseFloat(getComputedStyle(content).maxHeight)
        clampPx = isNaN(css) ? content.clientHeight : css
      }
      // scrollHeight is the full content height regardless of the cap, and text
      // rects keep their positions under overflow:hidden, so we can measure and
      // snap WITHOUT clearing maxHeight. Clearing it on every observer callback
      // resized the observed element and span the ResizeObserver in a loop
      // ("loop completed with undelivered notifications"). Tolerance so a post
      // only ~1 line over the clamp shows in full rather than a near-useless
      // "Show more" that reveals almost nothing.
      var over = content.scrollHeight > clampPx + 24
      content.classList.toggle('is-overflowing', over)
      var target = over ? snapHeight(clampPx) + 'px' : ''
      // Only write when it actually changes, so a steady state stops feeding the
      // observer new size mutations.
      if (content.style.maxHeight !== target) content.style.maxHeight = target
    }

    expandBtn.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      expanded = !expanded
      content.classList.toggle('collapsible--expanded', expanded)
      expandBtn.setAttribute('aria-expanded', String(expanded))
      label.textContent = expanded ? 'Show less' : 'Show more'
      if (expanded) {
        // Drop the snapped inline cap so the body can grow to full height.
        content.style.maxHeight = ''
      } else {
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

  return function (msg, opts) {
    if (!isRenderableMessage(msg)) return null

    // On a dedicated message/thread page we show the whole post — no
    // "Show more/Show less" clamp. opts.full opts out of the collapse.
    // (Beware: Array.prototype.map passes an index as the 2nd arg, so only
    // treat an object with .full as the option bag.)
    var full = !!(opts && typeof opts === 'object' && opts.full)

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

    var expandBtn = full ? null : makeExpander()

    var msgEl = h('div.message.message-card',
      h('div.title.row',
        h('div.avatar', api.avatar(msg.value.author, 'thumbnail')),
        isSsbski()
          ? h('span.message-author-key', {title: msg.value.author}, shortFeedId(msg.value.author))
          : null,
        h('div.message_meta.row', api.message_meta(msg))
      ),
      content,
      expandBtn,
      h('div.message_actions.row',
        h('div.actions', replyLink, api.message_action(msg), api.message_reactions(msg)),
        isSsbski() ? makeExtraActions(msg, content) : null
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

    // ── Click-anywhere-on-card → thread (ssbski feed cards only) ───────────
    if (!full && isSsbski()) wireCardClick(msgEl, msg)

    // ── Collapse long posts by default (Twitter-style) ─────────────────────
    // Skipped on the dedicated message page (full), where we show everything.
    if (!full) wireCollapse(content, expandBtn)

    return msgEl
  }
}
