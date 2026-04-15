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

// ── Full emoji data (Phase 6) ────────────────────────────────────────────────
var EMOJI_CATEGORIES = [
  {
    label: '😀 Smileys',
    emojis: [
      '😀','😁','😂','🤣','😅','😊','🥹','😍','🤩','🥰',
      '😎','🥳','😜','🤪','😇','🤔','🫡','😮','😱','😤',
      '🤬','😭','😢','😴','🥱','😷','🤒','🤗','🫠','😪'
    ]
  },
  {
    label: '👋 People',
    emojis: [
      '👋','🤚','✋','🖐','👌','🤌','✌️','🤞','🤙','🫶',
      '👍','👎','👏','🙌','🤝','💪','🦾','🙏','🫂','🤜'
    ]
  },
  {
    label: '🐶 Nature',
    emojis: [
      '🐶','🐱','🐭','🐸','🐧','🦊','🐺','🦋','🌸','🌺',
      '🌻','🍀','🌈','⛅','🌊','🔥','❄️','🌙','⭐','🌍'
    ]
  },
  {
    label: '🍕 Food',
    emojis: [
      '🍕','🍔','🌮','🍣','🍜','🍩','🍪','🎂','🍺','🥂',
      '☕','🧁','🍓','🍉','🥑','🌶️','🧀','🥚','🍫','🍭'
    ]
  },
  {
    label: '🎉 Fun',
    emojis: [
      '🎉','🎊','🎈','🎁','🏆','🥇','🎮','🎵','🎶','🎤',
      '⚽','🏀','🎯','🚀','✈️','🏖️','💰','💎','🔮','🪄'
    ]
  },
  {
    label: '❤️ Hearts',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '💕','💞','💓','💗','💘','💝','💖','💫','✨','💯'
    ]
  }
]

// Keyword → emoji list used for search
var EMOJI_KEYWORDS = {
  heart:   ['❤️','🧡','💛','💚','💙','💜','🤍','🖤','💕','💞','💓','💗','💘','💝','💖'],
  love:    ['❤️','😍','🥰','💕','💖','💝','🫶'],
  laugh:   ['😂','🤣','😅','😁'],
  smile:   ['😊','😀','😁','🥹'],
  cool:    ['😎','🤩','🥳'],
  party:   ['🎉','🥳','🎊','🎈','🎁'],
  sad:     ['😭','😢','💔'],
  angry:   ['😤','🤬'],
  fire:    ['🔥'],
  clap:    ['👏','🙌'],
  thanks:  ['🙏','🫶','💕'],
  ok:      ['👌','👍'],
  good:    ['👍','✌️','💪','😊'],
  bad:     ['👎','😤'],
  peace:   ['✌️','🌈'],
  dig:     ['✌️'],
  rocket:  ['🚀'],
  star:    ['⭐','✨','💫'],
  dog:     ['🐶'],
  cat:     ['🐱'],
  pizza:   ['🍕'],
  beer:    ['🍺'],
  coffee:  ['☕'],
  music:   ['🎵','🎶','🎤'],
  sport:   ['⚽','🏀','🎯'],
  money:   ['💰','💎'],
  snow:    ['❄️'],
  sun:     ['⭐','🌻'],
  wave:    ['🌊','👋'],
  strong:  ['💪','🦾'],
  think:   ['🤔','🫡'],
  sick:    ['😷','🤒'],
  sleep:   ['😴','🥱'],
  food:    ['🍕','🍔','🌮','🍣','🍜'],
  cake:    ['🎂','🍩','🧁','🍫'],
  wow:     ['😮','😱','🤩'],
  cry:     ['😭','😢','💔'],
  hug:     ['🤗','🫶','🫂'],
  flex:    ['💪','🦾'],
  like:    ['👍','❤️','✌️'],
  dislike: ['👎'],
  rainbow: ['🌈'],
  shine:   ['✨','💫','⭐']
}

// ── Recents via localStorage ─────────────────────────────────────────────────
var RECENTS_KEY = 'decent:recent-reactions'
var RECENTS_MAX = 16

function getRecents () {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]') }
  catch (e) { return [] }
}

function addToRecents (emoji) {
  try {
    var list = getRecents().filter(function (e) { return e !== emoji })
    list.unshift(emoji)
    if (list.length > RECENTS_MAX) list = list.slice(0, RECENTS_MAX)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list))
  } catch (e) {}
}

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
    var trayOpen       = false
    var pickerOpen     = false
    var closeTimer     = null
    var hoverTimer     = null
    var longPressTimer = null
    var outsideClickFn = null
    var escKeyFn       = null

    // Lazily-built picker elements — created once on first open
    var pickerEl          = null
    var pickerSearchInput = null
    var pickerBodyEl      = null

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
      addToRecents(emoji)
      sendReaction(emoji)
      closePicker()
      closeTray(true)
    }

    // ── Tray open / close ───────────────────────────────────────────────────
    function openTray () {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
      if (trayOpen) return
      trayOpen = true
      trayEl.classList.add('reaction-tray--open')

      outsideClickFn = function (e) {
        if (!reactionGroup.contains(e.target)) {
          closePicker()
          closeTray(true)
        }
      }
      escKeyFn = function (e) {
        if (e.key === 'Escape') {
          // Two-level: first Escape closes picker (if open), second closes tray
          if (pickerOpen) closePicker()
          else closeTray(true)
        }
      }
      document.addEventListener('click', outsideClickFn, true)
      document.addEventListener('keydown', escKeyFn)
    }

    function closeTray (immediate) {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
      if (immediate) {
        if (!trayOpen) return
        closePicker()
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

    // ── Emoji picker (Phase 6) ──────────────────────────────────────────────

    function renderPickerBody (query) {
      pickerBodyEl.innerHTML = ''

      if (query) {
        // Gather results: exact prefix matches first, then partial
        var seen = {}
        var results = []
        var kw
        for (kw in EMOJI_KEYWORDS) {
          if (kw.indexOf(query) === 0) {
            EMOJI_KEYWORDS[kw].forEach(function (e) {
              if (!seen[e]) { seen[e] = true; results.push(e) }
            })
          }
        }
        for (kw in EMOJI_KEYWORDS) {
          if (kw.indexOf(query) > 0) {
            EMOJI_KEYWORDS[kw].forEach(function (e) {
              if (!seen[e]) { seen[e] = true; results.push(e) }
            })
          }
        }
        // Also scan all emojis for any keyword that contains the query
        if (!results.length) {
          EMOJI_CATEGORIES.forEach(function (cat) {
            if (cat.label.toLowerCase().indexOf(query) >= 0) {
              cat.emojis.forEach(function (e) {
                if (!seen[e]) { seen[e] = true; results.push(e) }
              })
            }
          })
        }

        if (results.length) {
          var grid = h('div.emoji-grid')
          results.forEach(function (e) { grid.appendChild(makePickerBtn(e)) })
          pickerBodyEl.appendChild(grid)
        } else {
          pickerBodyEl.appendChild(
            h('div.reaction-picker__empty', 'No emoji for "' + query + '"')
          )
        }
        return
      }

      // No query: recents first, then categories
      var recents = getRecents()
      if (recents.length) {
        var rGrid = h('div.emoji-grid')
        recents.forEach(function (e) { rGrid.appendChild(makePickerBtn(e)) })
        pickerBodyEl.appendChild(
          h('div.reaction-picker__section',
            h('div.reaction-picker__label', 'Recently used'),
            rGrid
          )
        )
      }

      EMOJI_CATEGORIES.forEach(function (cat) {
        var grid = h('div.emoji-grid')
        cat.emojis.forEach(function (e) { grid.appendChild(makePickerBtn(e)) })
        pickerBodyEl.appendChild(
          h('div.reaction-picker__section',
            h('div.reaction-picker__label', cat.label),
            grid
          )
        )
      })
    }

    function makePickerBtn (emoji) {
      return h(
        'button.emoji-btn' + (myReaction === emoji ? '.emoji-btn--active' : ''),
        {
          type:    'button',
          title:   emoji,
          onclick: function (e) {
            e.preventDefault()
            e.stopPropagation()
            reactAndClose(emoji)
          }
        },
        emoji
      )
    }

    function buildPickerOnce () {
      if (pickerEl) return
      pickerSearchInput = h('input.reaction-picker__search', {
        type:         'text',
        placeholder:  'Search emoji…',
        autocomplete: 'off',
        oninput: function () {
          renderPickerBody(this.value.trim().toLowerCase())
        }
      })
      pickerBodyEl = h('div.reaction-picker__body')
      pickerEl = h('div.reaction-picker', pickerSearchInput, pickerBodyEl)
      reactionGroup.appendChild(pickerEl)
    }

    function openPicker () {
      if (pickerOpen) return
      // Ensure tray is open so the picker is visible in context
      if (!trayOpen) openTray()
      pickerOpen = true
      buildPickerOnce()
      // Position picker above the tray (tray height + gaps)
      var trayH = trayEl.offsetHeight || 44
      pickerEl.style.bottom = 'calc(100% + ' + (trayH + 16) + 'px)'
      // Reset search and refresh recents each time the picker opens
      pickerSearchInput.value = ''
      renderPickerBody('')
      // Add open class after a rAF so the CSS transition fires
      requestAnimationFrame(function () {
        pickerEl.classList.add('reaction-picker--open')
        pickerSearchInput.focus()
      })
    }

    function closePicker () {
      if (!pickerOpen) return
      pickerOpen = false
      if (pickerEl) pickerEl.classList.remove('reaction-picker--open')
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

    // ── Tray (floating pill) ────────────────────────────────────────────────
    var pickerTriggerBtn = h('button.action-btn.reaction-picker-trigger',
      {
        type:    'button',
        title:   'More emoji',
        onclick: function (e) {
          e.preventDefault()
          e.stopPropagation()
          if (pickerOpen) closePicker()
          else openPicker()
        }
      },
      h('span', '···')
    )

    var trayEl = h('div.reaction-tray',
      TRAY_EMOJIS.map(function (e) { return makeBtn(e, true) }),
      pickerTriggerBtn
    )

    // Keep tray open while mouse is over it
    trayEl.addEventListener('mouseenter', function () {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
    })
    trayEl.addEventListener('mouseleave', function () {
      if (!pickerOpen) closeTray()
    })

    // ── More button (+ toggle for tray) ─────────────────────────────────────
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
    // Note: pickerEl is appended to reactionGroup lazily inside buildPickerOnce()

    // Desktop hover — open tray after 300 ms hover-intent delay, close on leave
    var hasFineMouse = typeof window !== 'undefined' &&
      window.matchMedia && window.matchMedia('(pointer: fine)').matches
    if (hasFineMouse) {
      reactionGroup.addEventListener('mouseenter', function () {
        hoverTimer = setTimeout(openTray, 300)
      })
      reactionGroup.addEventListener('mouseleave', function () {
        clearTimeout(hoverTimer)
        if (!pickerOpen) closeTray()
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
