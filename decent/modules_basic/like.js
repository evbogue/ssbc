'use strict'
var h = require('hyperscript')
var pull = require('pull-stream')
var selfId = require('../keys').id

exports.needs = {
  avatar_name:     'first',
  message_confirm: 'first',
  message_link:    'first',
  sbot_links:      'first'
}

exports.gives = {
  message_content:      true,
  message_content_mini: true,
  message_meta:         true,
  message_action:       true
}

// Quick reactions always visible in the action row
var QUICK_REACTIONS = ['❤️', '✌️']

// Full curated row inside the floating tray
var TRAY_EMOJIS = ['❤️', '✌️', '😂', '🔥', '😮', '😭', '👍', '👎']

exports.create = function (api) {
  var x = {}

  function getCache () {
    return typeof window !== 'undefined' && window.CACHE ? window.CACHE : {}
  }

  // Render a vote/reaction message in the feed
  x.message_content =
  x.message_content_mini = function (msg) {
    if (msg.value.content.type !== 'vote') return
    var vote = msg.value.content.vote
    if (!vote) return
    var isOldFormat = typeof vote === 'string'
    var voteValue   = isOldFormat ? 1 : (vote.value || 0)
    var voteLink    = isOldFormat ? vote : vote.link
    var emoji       = (!isOldFormat && vote.expression && vote.expression.length <= 8)
      ? vote.expression : '❤️'
    return [
      voteValue > 0 ? (emoji + ' reacted to') : 'removed reaction from',
      ' ', api.message_link(voteLink)
    ]
  }

  // Aggregate reaction count in the post header
  x.message_meta = function (msg) {
    var cache = getCache()
    var votes = []
    for (var k in cache) {
      var cached = cache[k]
      var c = cached && cached.content
      if (!c || c.type !== 'vote') continue
      var voteLink = c.vote && (typeof c.vote === 'string' ? c.vote : c.vote.link)
      if (voteLink !== msg.key) continue
      if (typeof c.vote !== 'string' && !(c.vote && c.vote.value > 0)) continue
      votes.push({ source: cached.author })
    }
    if (!votes.length) return null

    var el = h('span.action-liked-meta',
      h('span.reaction-emoji-meta', '❤️'),
      h('span.action-count', String(votes.length))
    )
    pull(
      pull.values(votes.map(function (v) { return api.avatar_name(v.source) })),
      pull.collect(function (err, ary) {
        el.title = ary.map(function (x) {
          return x && x.textContent ? x.textContent : String(x)
        }).join(', ')
      })
    )
    return el
  }

  x.message_action = function (msg) {
    if (msg.value.content.type === 'vote') return

    var cache = getCache()
    var myVote = null
    var counts = {}

    for (var k in cache) {
      var cached = cache[k]
      var c = cached && cached.content
      if (!c || c.type !== 'vote') continue

      var voteLink, voteValue, voteEmoji
      if (typeof c.vote === 'string') {
        voteLink = c.vote; voteValue = 1; voteEmoji = '❤️'
      } else if (c.vote && typeof c.vote === 'object') {
        voteLink  = c.vote.link
        voteValue = c.vote.value || 0
        voteEmoji = (c.vote.expression && c.vote.expression.length <= 8)
          ? c.vote.expression : '❤️'
      } else { continue }

      if (voteLink !== msg.key) continue

      if (cached.author === selfId) {
        var ts = cached.timestamp || 0
        if (!myVote || ts > myVote.timestamp)
          myVote = { emoji: voteEmoji, value: voteValue, timestamp: ts }
      }
      if (voteValue > 0)
        counts[voteEmoji] = (counts[voteEmoji] || 0) + 1
    }

    var myReaction = (myVote && myVote.value > 0) ? myVote.emoji : null

    // ── State ───────────────────────────────────────────────────────────────
    var trayOpen      = false
    var closeTimer    = null
    var hoverTimer    = null
    var longPressTimer= null
    var outsideClickFn= null
    var escKeyFn      = null

    // ── Core send ───────────────────────────────────────────────────────────
    function sendReaction (emoji) {
      var newVal = myReaction === emoji ? 0 : 1
      var vote = { type: 'vote', vote: { link: msg.key, value: newVal, expression: emoji } }
      if (msg.value.content.recps) {
        vote.recps = msg.value.content.recps.map(function (r) {
          return r && typeof r !== 'string' ? r.link : r
        })
        vote.private = true
      }
      api.message_confirm(vote)
    }

    function reactAndClose (emoji) {
      sendReaction(emoji)
      closeTray(true)
    }

    // ── Tray open / close ───────────────────────────────────────────────────
    function openTray () {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
      if (trayOpen) return
      trayOpen = true
      trayEl.classList.add('reaction-tray--open')

      // Close on any outside click
      outsideClickFn = function (e) {
        if (!reactionGroup.contains(e.target)) closeTray(true)
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
        trayEl.classList.remove('reaction-tray--open')
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

    // ── Button factories ────────────────────────────────────────────────────
    function makeBtn (emoji, inTray) {
      var isActive = myReaction === emoji
      var count    = counts[emoji] || 0
      return h(
        'button.action-btn.action-btn--react' + (isActive ? '.action-btn--reacted' : ''),
        {
          type:    'button',
          title:   (isActive ? 'Remove ' : 'React ') + emoji,
          onclick: function (e) {
            e.preventDefault()
            if (inTray) e.stopPropagation()
            reactAndClose(emoji)
          }
        },
        h('span.reaction-emoji', emoji),
        count > 0 ? h('span.action-count', String(count)) : null
      )
    }

    // ── Tray (floating pill, Phase 5) ───────────────────────────────────────
    var trayEl = h('div.reaction-tray',
      TRAY_EMOJIS.map(function (e) { return makeBtn(e, true) })
    )

    // Keep tray open while mouse is over it
    trayEl.addEventListener('mouseenter', function () {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
    })
    trayEl.addEventListener('mouseleave', function () { closeTray() })

    // ── More button (+ toggle) ──────────────────────────────────────────────
    var moreBtn = h('button.action-btn.action-btn--react-more',
      {
        type:    'button',
        title:   'More reactions',
        onclick: function (e) {
          e.preventDefault()
          e.stopPropagation()
          if (trayOpen) closeTray(true)
          else openTray()
        }
      },
      h('span', '+')
    )

    // ── Reaction group container ────────────────────────────────────────────
    var reactionGroup = h('div.reaction-group',
      QUICK_REACTIONS.map(function (e) { return makeBtn(e, false) }),
      moreBtn,
      trayEl
    )

    // Desktop hover — open after 300 ms hover-intent delay, close on leave
    var hasFineMouse = typeof window !== 'undefined' &&
      window.matchMedia && window.matchMedia('(pointer: fine)').matches
    if (hasFineMouse) {
      reactionGroup.addEventListener('mouseenter', function () {
        hoverTimer = setTimeout(openTray, 300)
      })
      reactionGroup.addEventListener('mouseleave', function () {
        clearTimeout(hoverTimer)
        closeTray()
      })
    }

    // Mobile long-press (400 ms) to open tray
    reactionGroup.addEventListener('touchstart', function () {
      longPressTimer = setTimeout(openTray, 400)
    }, { passive: true })
    reactionGroup.addEventListener('touchend', function () {
      clearTimeout(longPressTimer)
    }, { passive: true })
    reactionGroup.addEventListener('touchmove', function () {
      clearTimeout(longPressTimer)
    }, { passive: true })

    return reactionGroup
  }

  return x
}
