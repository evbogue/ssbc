'use strict'
var h = require('hyperscript')
var pull = require('pull-stream')
var human = require('human-time')
var selfId = require('../../keys').id

exports.needs = {
  avatar:       'first',
  avatar_image: 'first',
  avatar_name:  'first',
  publish:      'first',
  message_link: 'first',
  sbot_links:   'first'
}

exports.gives = {
  message_content:      true,
  message_content_mini: true,
  message_action:       true,
  message_reactions:    true
}

// Keep the inline action row compact; the full picker opens on hover/long-press
var QUICK_REACTIONS = ['❤️']

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

// Shared helper: walk the cache and return { counts, myReactions } for a msg key.
// Multi-reaction model (Slack/Discord-style): each (author, emoji) pair is a
// distinct reaction. Deduped per (author, emoji) by most-recent timestamp —
// so toggling an emoji off via value:0 correctly removes it from counts.
function aggregateReactions (cache, msgKey) {
  var userEmojiVotes = {}
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
      voteEmoji = ((c.vote.reason || c.vote.expression) && (c.vote.reason || c.vote.expression).length <= 8)
        ? (c.vote.reason || c.vote.expression) : '❤️'
    } else { continue }

    if (voteLink !== msgKey) continue

    var aut = cached.author
    var ts  = cached.timestamp || 0
    var key = aut + '|' + voteEmoji
    if (!userEmojiVotes[key] || ts > userEmojiVotes[key].ts)
      userEmojiVotes[key] = { author: aut, emoji: voteEmoji, value: voteValue, ts: ts }
  }

  var counts = {}
  var myReactions = {}
  var reactors = {}
  for (var kk in userEmojiVotes) {
    var uv = userEmojiVotes[kk]
    if (uv.value > 0) {
      counts[uv.emoji] = (counts[uv.emoji] || 0) + 1
      if (uv.author === selfId) myReactions[uv.emoji] = true
      ;(reactors[uv.emoji] || (reactors[uv.emoji] = [])).push({ author: uv.author, ts: uv.ts })
    }
  }
  // Each emoji's reactors, most recent first — drives the who-reacted popover.
  for (var em in reactors) {
    reactors[em].sort(function (a, b) { return b.ts - a.ts })
  }
  return { counts: counts, myReactions: myReactions, reactors: reactors }
}

// Optimistic-update helpers. Synthesise a vote entry into window.CACHE so the
// aggregator picks it up instantly, then broadcast a window event so every
// renderer (pill chips, heart button, tray buttons, open picker) refreshes in
// lockstep. Real vote arriving via sbot_log later has a newer timestamp and
// wins the per-(author, emoji) dedup — zero flicker on replace.
// detail.emoji/detail.reacted are set only when a self-click activates a
// reaction, so renderers can fire a one-shot pop on exactly that emoji.
// Peer-vote arrivals and rollbacks fire without them (no pop).
function fireVoteChanged (msgKey, detail) {
  if (typeof window === 'undefined') return
  var d = { msgKey: msgKey }
  if (detail) { d.emoji = detail.emoji; d.reacted = detail.reacted }
  var ev
  try {
    ev = new CustomEvent('decent:vote-changed', { detail: d })
  } catch (err) {
    ev = document.createEvent('CustomEvent')
    ev.initCustomEvent('decent:vote-changed', false, false, d)
  }
  window.dispatchEvent(ev)
}

function applyOptimistic (msgKey, voteContent, authorId) {
  if (typeof window === 'undefined') return null
  var cache = window.CACHE = window.CACHE || {}
  var v = voteContent.vote || {}
  var emoji = (v.reason && v.reason.length <= 8) ? v.reason : '❤️'
  var tempKey = '%optimistic:' + msgKey + ':' + (v.reason || '') + ':' + Date.now() + ':' + Math.random()
  cache[tempKey] = {
    author:    authorId,
    timestamp: Date.now(),
    content:   voteContent
  }
  fireVoteChanged(msgKey, { emoji: emoji, reacted: (v.value || 0) > 0 })
  return tempKey
}

// One-shot pop: restart the keyframe even if the class lingers, and self-clean.
function popEl (el) {
  if (!el) return
  el.classList.remove('reaction-pop-anim')
  void el.offsetWidth
  el.classList.add('reaction-pop-anim')
  el.addEventListener('animationend', function handler () {
    el.classList.remove('reaction-pop-anim')
    el.removeEventListener('animationend', handler)
  })
}

function rollbackOptimistic (tempKey, msgKey) {
  if (typeof window === 'undefined' || !window.CACHE || !tempKey) return
  delete window.CACHE[tempKey]
  fireVoteChanged(msgKey)
}

exports.create = function (api) {
  var x = {}

  function getCache () {
    return typeof window !== 'undefined' && window.CACHE ? window.CACHE : {}
  }

  // Single publish path for every reaction surface (chips, heart, tray, picker).
  // isActive = the viewer currently has this reaction → clicking removes it.
  // Publishes directly via api.publish — a reaction is a one-tap action, so it
  // skips the message_confirm Publish/Cancel lightbox that composing uses
  // (otherwise the optimistic update + pop are hidden behind a modal and every
  // reaction takes two clicks).
  function castVote (msg, emoji, isActive) {
    var vote = { type: 'vote', vote: { link: msg.key, value: isActive ? 0 : 1, reason: emoji } }
    if (msg.value.content.recps) {
      vote.recps = msg.value.content.recps.map(function (r) {
        return r && typeof r !== 'string' ? r.link : r
      })
      vote.private = true
    }
    var tempKey = applyOptimistic(msg.key, vote, selfId)
    api.publish(vote, function (err, published) {
      if (err || !published) rollbackOptimistic(tempKey, msg.key)
    })
  }

  // ── Shared vote pub/sub (Stage 1.7) ──────────────────────────────────────
  // Previously every rendered post attached its own `decent:vote-changed`
  // window listener AND opened its own live `sbot_links` stream — both leaked
  // unboundedly under infinite scroll, and each reaction fanned out across all
  // of them. Consolidated to ONE window listener + ONE live stream for the
  // whole feed. Posts register a render callback keyed by msg.key and hand over
  // their root node; dispatch drops any callback whose node has detached, so
  // the registry doesn't grow as posts scroll out.
  var voteSubs = Object.create(null) // msgKey -> [ { el, fn } ]

  function subscribeVote (msgKey, el, fn) {
    var list = voteSubs[msgKey] || (voteSubs[msgKey] = [])
    list.push({ el: el, fn: fn })
  }

  function dispatchVote (detail) {
    var list = voteSubs[detail.msgKey]
    if (!list) return
    for (var i = list.length - 1; i >= 0; i--) {
      var sub = list[i]
      if (sub.el && typeof document !== 'undefined' && !document.contains(sub.el)) {
        list.splice(i, 1) // node gone — drop the dead subscription
        continue
      }
      sub.fn(detail)
    }
    if (!list.length) delete voteSubs[detail.msgKey]
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('decent:vote-changed', function (ev) {
      if (ev && ev.detail) dispatchVote(ev.detail)
    })
  }

  // Coalesce incoming peer votes (especially the historical backfill burst at
  // startup) into one notification per target post per frame. Optimistic
  // self-reactions bypass this — applyOptimistic fires immediately with
  // emoji/reacted detail so the pop is instant; these batched notifications
  // carry no detail, so peer votes re-render without popping.
  var dirty = null
  function markDirty (dest) {
    if (!dest) return
    if (!dirty) {
      dirty = Object.create(null)
      requestAnimationFrame(flushDirty)
    }
    dirty[dest] = true
  }
  function flushDirty () {
    var d = dirty
    dirty = null
    for (var dest in d) fireVoteChanged(dest)
  }

  // One live stream of every vote link across the whole feed (historic + live),
  // started lazily on first post render. Each vote is injected into CACHE and
  // its target post (link.dest) is marked dirty.
  var voteStreamStarted = false
  function ensureVoteStream () {
    if (voteStreamStarted || typeof window === 'undefined') return
    voteStreamStarted = true
    var cache = getCache()
    pull(
      api.sbot_links({ rel: 'vote', values: true, keys: true, live: true, old: true }),
      pull.drain(function (link) {
        if (!link || !link.key || !link.value) return
        if (cache[link.key]) return
        cache[link.key] = link.value
        markDirty(link.dest)
      })
    )
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
    var rawReason   = !isOldFormat && (vote.reason || vote.expression)
    var emoji       = (rawReason && rawReason.length <= 8) ? rawReason : '❤️'
    return [
      voteValue > 0 ? (emoji + ' reacted to') : 'removed reaction from',
      ' ', api.message_link(voteLink)
    ]
  }

  // Aggregated chips: one pill on the bottom-right of each post with one chip
  // per distinct emoji. Fetches vote backlinks so chips reflect ALL reactions
  // on this post, not just the ones that happen to be in window.CACHE from the
  // log scroll.
  x.message_reactions = function (msg) {
    if (msg.value.content.type === 'vote') return

    var pill = h('div.reaction-pill')
    var chipEls = {}
    var lastSig = null
    var lastReactors = {} // emoji -> [ { author, ts } ], newest first

    // ── Who-reacted popover (Stage 4) ─────────────────────────────────────────
    // Hover-intent / long-press a chip → a panel listing everyone who reacted
    // with that emoji (avatar + linked name + relative time). One popover node
    // per pill, reused across chips. Reuses the .reaction-picker panel look.
    var popoverEl   = null
    var popoverEmoji = null
    var hoverTimer  = null
    var pressTimer  = null
    var popOutsideFn = null
    var popEscFn     = null

    function buildPopoverOnce () {
      if (popoverEl) return
      popoverEl = h('div.reaction-popover')
      pill.appendChild(popoverEl)
    }

    function fillPopover (emoji) {
      popoverEl.innerHTML = ''
      var list = lastReactors[emoji] || []
      popoverEl.appendChild(
        h('div.reaction-popover__head', emoji + ' ' + list.length)
      )
      list.forEach(function (r) {
        popoverEl.appendChild(
          h('div.reaction-popover__row',
            api.avatar(r.author, 'tiny'),
            h('span.reaction-popover__time', r.ts ? human(new Date(r.ts)) : '')
          )
        )
      })
      if (!list.length) {
        popoverEl.appendChild(h('div.reaction-popover__row', 'No reactions'))
      }
    }

    function openPopover (emoji, chipEl) {
      buildPopoverOnce()
      popoverEmoji = emoji
      fillPopover(emoji)
      // Anchor above the hovered chip, centred on it.
      popoverEl.style.left = (chipEl.offsetLeft + chipEl.offsetWidth / 2) + 'px'
      popoverEl.style.bottom = 'calc(100% + 8px)'
      requestAnimationFrame(function () {
        if (popoverEl) popoverEl.classList.add('reaction-popover--open')
      })
      if (!popOutsideFn) {
        popOutsideFn = function (e) {
          if (!pill.contains(e.target)) closePopover()
        }
        popEscFn = function (e) { if (e.key === 'Escape') closePopover() }
        document.addEventListener('click', popOutsideFn, true)
        document.addEventListener('keydown', popEscFn)
      }
    }

    function closePopover () {
      clearTimeout(hoverTimer)
      clearTimeout(pressTimer)
      popoverEmoji = null
      if (popoverEl) popoverEl.classList.remove('reaction-popover--open')
      if (popOutsideFn) {
        document.removeEventListener('click', popOutsideFn, true)
        document.removeEventListener('keydown', popEscFn)
        popOutsideFn = null
        popEscFn = null
      }
    }

    var hasFinePointer = typeof window !== 'undefined' &&
      window.matchMedia && window.matchMedia('(pointer: fine)').matches

    function wireChipHover (chip, emoji) {
      if (hasFinePointer) {
        chip.addEventListener('mouseenter', function () {
          clearTimeout(hoverTimer)
          hoverTimer = setTimeout(function () { openPopover(emoji, chip) }, 500)
        })
        chip.addEventListener('mouseleave', function () {
          clearTimeout(hoverTimer)
        })
      }
      chip.addEventListener('touchstart', function () {
        clearTimeout(pressTimer)
        pressTimer = setTimeout(function () { openPopover(emoji, chip) }, 400)
      }, { passive: true })
      chip.addEventListener('touchend', function () { clearTimeout(pressTimer) }, { passive: true })
      chip.addEventListener('touchmove', function () { clearTimeout(pressTimer) }, { passive: true })
      // Shift+Enter opens the popover; plain Enter toggles (native button click).
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault()
          if (popoverEmoji === emoji) closePopover()
          else openPopover(emoji, chip)
        }
      })
    }

    // popEmoji: when set, fire a one-shot pop on that chip. The signature guard
    // means the real vote arriving (same counts as the optimistic one) reuses
    // the existing chip element, so its pop animation runs to completion instead
    // of being cut short by a rebuild.
    function renderChips (popEmoji) {
      var agg = aggregateReactions(getCache(), msg.key)
      var counts = agg.counts
      var myReactions = agg.myReactions
      lastReactors = agg.reactors
      var emojis = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] })
      // Signature drives the rebuild guard. For chips showing avatars (≤5
      // reactors) the avatar set can change while the count holds steady (one
      // person swaps in for another), so fold the reactor identities into the
      // signature below the avatar threshold; above it, the bare count suffices.
      var sig = emojis.map(function (e) {
        var rs = agg.reactors[e] || []
        var who = rs.length <= 5 ? rs.map(function (r) { return r.author }).join('|') : 'n'
        return e + ':' + counts[e] + ':' + (myReactions[e] ? 1 : 0) + ':' + who
      }).join(',')

      if (sig !== lastSig) {
        lastSig = sig
        // innerHTML wipe also detaches the popover node — drop our reference and
        // close it so a stale popover can't dangle over rebuilt chips.
        if (popoverEmoji) closePopover()
        popoverEl = null
        pill.innerHTML = ''
        chipEls = {}
        emojis.forEach(function (emoji) {
          var isActive = !!myReactions[emoji]
          var rs = agg.reactors[emoji] || []
          // ≤5 reactors → overlapping avatar faces (no links: a chip is a
          // toggle button, and the who-reacted popover already provides the
          // linkable list). >5 → numeric count, as before.
          var tail
          if (rs.length && rs.length <= 5) {
            tail = h('span.reaction-chip__avatars')
            rs.forEach(function (r) {
              tail.appendChild(api.avatar_image(r.author, 'micro'))
            })
          } else {
            tail = h('span.reaction-chip__count', String(counts[emoji]))
          }
          var chip = h(
            'button.reaction-chip' + (isActive ? '.reaction-chip--active' : ''),
            {
              type:    'button',
              title:   (isActive ? 'Remove ' : 'React ') + emoji,
              onclick: function (e) {
                e.preventDefault()
                e.stopPropagation()
                closePopover()
                castVote(msg, emoji, isActive)
              }
            },
            h('span.reaction-chip__emoji', emoji),
            tail
          )
          wireChipHover(chip, emoji)
          chipEls[emoji] = chip
          pill.appendChild(chip)
        })
      }

      if (popEmoji) popEl(chipEls[popEmoji])
    }

    // Re-render whenever anyone (self or otherwise) publishes a vote on this
    // post, via the shared registry. Only a self-activation carries an
    // emoji/reacted detail, so only that case pops.
    subscribeVote(msg.key, pill, function (detail) {
      renderChips(detail.reacted ? detail.emoji : null)
    })

    // First pass: whatever's already in CACHE. The shared live stream backfills
    // any votes not yet cached and re-renders this pill as they land.
    renderChips()
    ensureVoteStream()

    return pill
  }

  // Action button: heart + hover-tray + full emoji picker (restored original UX)
  x.message_action = function (msg) {
    if (msg.value.content.type === 'vote') return

    var myReactions = aggregateReactions(getCache(), msg.key).myReactions

    // ── State ───────────────────────────────────────────────────────────────
    var trayOpen       = false
    var pickerOpen     = false
    var closeTimer     = null
    var hoverTimer     = null
    var longPressTimer = null
    var outsideClickFn = null
    var escKeyFn       = null

    var pickerEl          = null
    var pickerSearchInput = null
    var pickerBodyEl      = null

    // Every heart + tray button is stashed here so a single vote event can
    // toggle their "reacted" class without rebuilding the tray.
    var emojiBtns = {}

    function refreshReactedUI (popEmoji) {
      myReactions = aggregateReactions(getCache(), msg.key).myReactions
      Object.keys(emojiBtns).forEach(function (emoji) {
        var btn = emojiBtns[emoji]
        if (!btn) return
        if (myReactions[emoji]) btn.classList.add('action-btn--reacted')
        else btn.classList.remove('action-btn--reacted')
        btn.title = (myReactions[emoji] ? 'Remove ' : 'React ') + emoji
      })
      // Pop the button only when the viewer just added this reaction (silence
      // on un-react), and only if that button is currently mounted (heart, or
      // a tray emoji while the tray is open).
      if (popEmoji && emojiBtns[popEmoji]) popEl(emojiBtns[popEmoji])
      if (pickerOpen && pickerSearchInput) {
        renderPickerBody(pickerSearchInput.value.trim().toLowerCase())
      }
    }

    function sendReaction (emoji) {
      castVote(msg, emoji, !!myReactions[emoji])
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

    // ── Emoji picker ────────────────────────────────────────────────────────

    function renderPickerBody (query) {
      pickerBodyEl.innerHTML = ''

      if (query) {
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
        'button.emoji-btn' + (myReactions[emoji] ? '.emoji-btn--active' : ''),
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
      if (!trayOpen) openTray()
      pickerOpen = true
      buildPickerOnce()
      var trayH = trayEl.offsetHeight || 44
      pickerEl.style.bottom = 'calc(100% + ' + (trayH + 16) + 'px)'
      pickerSearchInput.value = ''
      renderPickerBody('')
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
      var isActive = !!myReactions[emoji]
      var iconEl = inTray
        ? h('span.reaction-emoji', emoji)
        : h('span.material-symbols-outlined.action-icon', 'favorite')
      var btn = h(
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
        iconEl
      )
      emojiBtns[emoji] = btn
      return btn
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

    trayEl.addEventListener('mouseenter', function () {
      clearTimeout(closeTimer)
      clearTimeout(hoverTimer)
    })
    trayEl.addEventListener('mouseleave', function () {
      if (!pickerOpen) closeTray()
    })

    // ── Reaction group container ────────────────────────────────────────────
    var reactionGroup = h('div.reaction-group',
      QUICK_REACTIONS.map(function (e) { return makeBtn(e, false) }),
      trayEl
    )

    // Refresh heart/tray "reacted" state on any vote change for this post via
    // the shared registry; pop only on self-activation (detail.reacted).
    subscribeVote(msg.key, reactionGroup, function (detail) {
      refreshReactedUI(detail.reacted ? detail.emoji : null)
    })

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
