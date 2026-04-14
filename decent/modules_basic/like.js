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

exports.create = function (api) {
  var x = {}

  function getCache () {
    return typeof window !== 'undefined' && window.CACHE ? window.CACHE : {}
  }

  // Quick reactions always visible on each post
  var QUICK_REACTIONS = ['❤️', '✌️']
  // Additional reactions behind the + button (Phase 5 will upgrade this into an animated tray)
  var TRAY_REACTIONS  = ['😂', '🔥', '😮', '👍', '👎']

  // Render a vote/reaction message in the feed (e.g. "❤️ reacted to <link>")
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

  // Aggregate reaction count shown in the post header
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
    var myVote = null   // {emoji, value, timestamp} — current user's most-recent vote
    var counts = {}     // emoji → positive vote count (not deduped per user; Phase 8 fixes this)

    for (var k in cache) {
      var cached = cache[k]
      var c = cached && cached.content
      if (!c || c.type !== 'vote') continue

      var voteLink, voteValue, voteEmoji
      if (typeof c.vote === 'string') {
        // Legacy vote format: c.vote is the message key directly
        voteLink  = c.vote
        voteValue = 1
        voteEmoji = '❤️'
      } else if (c.vote && typeof c.vote === 'object') {
        voteLink  = c.vote.link
        voteValue = c.vote.value || 0
        voteEmoji = (c.vote.expression && c.vote.expression.length <= 8)
          ? c.vote.expression : '❤️'
      } else {
        continue
      }

      if (voteLink !== msg.key) continue

      // Track current user's most-recent vote by timestamp
      if (cached.author === selfId) {
        var ts = cached.timestamp || 0
        if (!myVote || ts > myVote.timestamp)
          myVote = { emoji: voteEmoji, value: voteValue, timestamp: ts }
      }

      // Count positive votes per emoji across all users
      if (voteValue > 0)
        counts[voteEmoji] = (counts[voteEmoji] || 0) + 1
    }

    // The emoji the current user has active, or null if none
    var myReaction = (myVote && myVote.value > 0) ? myVote.emoji : null

    function sendReaction (emoji) {
      // Same emoji → toggle off (remove); different emoji → apply (replaces current)
      var newVal = myReaction === emoji ? 0 : 1
      var vote = {
        type: 'vote',
        vote: { link: msg.key, value: newVal, expression: emoji }
      }
      if (msg.value.content.recps) {
        vote.recps = msg.value.content.recps.map(function (r) {
          return r && typeof r !== 'string' ? r.link : r
        })
        vote.private = true
      }
      api.message_confirm(vote)
    }

    function makeReactBtn (emoji) {
      var isActive = myReaction === emoji
      var count    = counts[emoji] || 0
      return h(
        'button.action-btn.action-btn--react' + (isActive ? '.action-btn--reacted' : ''),
        {
          type:    'button',
          title:   (isActive ? 'Remove ' : 'React ') + emoji,
          onclick: function (e) { e.preventDefault(); sendReaction(emoji) }
        },
        h('span.reaction-emoji', emoji),
        count > 0 ? h('span.action-count', String(count)) : null
      )
    }

    var trayOpen = false

    var trayEl = h('div.reaction-tray',
      { style: { display: 'none' } },
      TRAY_REACTIONS.map(makeReactBtn)
    )

    var moreBtn = h('button.action-btn.action-btn--react-more',
      {
        type:    'button',
        title:   'More reactions',
        onclick: function (e) {
          e.preventDefault()
          trayOpen = !trayOpen
          trayEl.style.display = trayOpen ? 'flex' : 'none'
          moreBtn.classList.toggle('action-btn--tray-open', trayOpen)
        }
      },
      h('span', '+')
    )

    return h('div.reaction-group',
      QUICK_REACTIONS.map(makeReactBtn).concat([moreBtn]),
      trayEl
    )
  }

  return x
}
