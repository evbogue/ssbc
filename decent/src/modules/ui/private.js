'use strict'
var h = require('hyperscript')
var u = require('../../util')
var pull = require('pull-stream')
var Scroller = require('../../scroller')
var ref = require('ssb-ref')
var keys = require('../../keys')
var emptyState = require('../../empty-state')
var mentions = require('ssb-mentions')
var suggest = require('suggest-box')
var cont = require('cont')

function map(ary, iter) {
  if(Array.isArray(ary)) return ary.map(iter)
}

exports.needs = {
  message_render: 'first',
  message_compose: 'first',
  message_content: 'first',
  markdown: 'first',
  message_unbox: 'first',
  sbot_log: 'first',
  avatar_image: 'first',
  avatar_image_link: 'first',
  avatar_name: 'first',
  publish: 'first',
  suggest_mentions: 'map'
}

exports.gives = {
  builtin_tabs: true,
  screen_view: true,
  message_meta: true,
  message_content_mini: true
}

exports.create = function (api) {
  var id = keys.id

  function isSsbskiSkin () {
    return typeof document !== 'undefined' &&
      !!document.querySelector(
        'link[rel="stylesheet"][href*="ssbski-style.css"],' +
        'link[rel="stylesheet"][href*="ssbpro-style.css"]'
      )
  }

  // ── private message stream ──────────────────────────────────────────────
  // Scan the log and keep only the messages we can decrypt (our DMs). The
  // plaintext content — including recps — is exposed by message_unbox.
  function privateStream (opts) {
    return pull(
      u.next(api.sbot_log, opts),
      pull.map(function (msg) {
        if(!msg || !msg.value || 'string' != typeof msg.value.content) return null
        var unboxed = api.message_unbox(msg)
        if(unboxed) {
          unboxed.value.private = true
          // Keep the original on-wire message (content is the encrypted .box
          // blob) so the raw view can prove the message is actually encrypted.
          unboxed.boxed = msg
          return unboxed
        }
        return null
      }),
      pull.filter(Boolean)
    )
  }

  // ── conversation identity helpers ─────────────────────────────────────────
  function feedIdOf (e) { return 'string' === typeof e ? e : (e && e.link) }

  function participantsOf (msg) {
    var recps = (msg.value.content && msg.value.content.recps) || []
    var seen = {}, out = []
    recps.map(feedIdOf).forEach(function (f) {
      if (f && ref.isFeed(f) && !seen[f]) { seen[f] = true; out.push(f) }
    })
    return out
  }

  function convIdOf (participants) { return participants.slice().sort().join(',') }
  function othersOf (participants) {
    var others = participants.filter(function (f) { return f !== id })
    return others.length ? others : [id]  // note-to-self
  }
  function tsOf (msg) { return (msg.value && msg.value.timestamp) || msg.timestamp || 0 }

  // dm route encodes the *other* participants joined by '~' (feed ids never
  // contain '~'); the conversation always also includes self.
  function routeForOthers (others) { return 'dm/' + others.join('~') }
  function othersFromRoute (route) {
    return route.slice(3).split('~').filter(Boolean)
  }

  function previewText (msg) {
    var c = msg.value && msg.value.content
    var t = (c && typeof c.text === 'string') ? c.text : ''
    t = t.replace(/\s+/g, ' ').trim()
    if (!t && c && c.type) t = c.type
    return t.length > 60 ? t.slice(0, 60) + '…' : t
  }

  function relTime (ts) {
    if (!ts) return ''
    var s = Math.max(0, (Date.now() - ts) / 1000)
    if (s < 60) return Math.floor(s) + 's'
    if (s < 3600) return Math.floor(s / 60) + 'm'
    if (s < 86400) return Math.floor(s / 3600) + 'h'
    if (s < 86400 * 7) return Math.floor(s / 86400) + 'd'
    return new Date(ts).toLocaleDateString()
  }

  // ── unread tracking (per-conversation last-seen timestamp) ────────────────
  var SEEN_KEY = 'ssbski:dm-seen'
  function getSeen () {
    try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || '{}') || {} }
    catch (e) { return {} }
  }
  function markSeen (cid, ts) {
    try {
      var seen = getSeen()
      if (!seen[cid] || ts > seen[cid]) {
        seen[cid] = ts
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
      }
    } catch (e) {}
  }

  // ── conversation list (inbox) ─────────────────────────────────────────────
  function renderInbox () {
    var list = h('div.chat-list')
    var head = h('div.chat-list__head',
      h('span.chat-list__title', 'Messages'),
      h('button.chat-new-btn', {
        type: 'button', title: 'New chat', 'aria-label': 'New chat',
        onclick: openNewChat
      }, h('span.material-symbols-outlined', {'aria-hidden': 'true'}, 'edit'))
    )

    var div = h('div.column.scroller', {style: {'overflow': 'auto'}})
    div.setAttribute('data-icon', 'lock')
    div.title = 'Chat'
    div.appendChild(h('div.scroller__wrapper.chat-list__wrapper', head, list))

    var lastSig = null
    function rebuild () {
      pull(
        privateStream({reverse: true, limit: 1000}),
        pull.collect(function (err, msgs) {
          if (err) return
          var convs = {}
          msgs.forEach(function (m) {
            var parts = participantsOf(m)
            if (!parts.length) return
            var cid = convIdOf(parts)
            var ts = tsOf(m)
            var cur = convs[cid]
            if (!cur || ts > cur.lastTs) convs[cid] = {parts: parts, last: m, lastTs: ts}
          })
          var rows = Object.keys(convs).map(function (k) { return convs[k] })
            .sort(function (a, b) { return b.lastTs - a.lastTs })

          // Skip the DOM rebuild when nothing changed (avoids 4s flicker).
          var sig = rows.map(function (c) { return convIdOf(c.parts) + ':' + c.lastTs }).join('|')
          if (sig === lastSig) return
          lastSig = sig

          list.innerHTML = ''
          if (!rows.length) {
            emptyState(list, {
              icon: 'forum',
              title: 'No conversations yet',
              body: 'Start a chat to send your first private message.'
            })
            return
          }
          var seen = getSeen()
          rows.forEach(function (c) {
            list.appendChild(renderConvRow(c, seen))
          })
        })
      )
    }

    rebuild()
    pollWhileMounted(div, rebuild)
    return div
  }

  function renderConvRow (c, seen) {
    var others = othersOf(c.parts)
    var primary = others[0]
    var cid = convIdOf(c.parts)
    var route = routeForOthers(others)

    var nameEl = others.length > 1
      ? h('span.chat-row__name', others.length + ' people')
      : h('span.chat-row__name', api.avatar_name(primary))

    var unread = c.lastTs > (seen[cid] || 0) && c.last.value.author !== id

    var row = h('a.chat-list__row' + (unread ? '.chat-list__row--unread' : ''),
      {href: '#' + route},
      h('div.chat-row__avatar', api.avatar_image(primary, 'thumbnail')),
      h('div.chat-row__body',
        h('div.chat-row__top',
          nameEl,
          h('span.chat-row__time', relTime(c.lastTs))
        ),
        h('div.chat-row__preview', previewText(c.last))
      ),
      unread ? h('span.chat-row__unread', {'aria-label': 'Unread'}) : null
    )
    return row
  }

  // ── thread view ────────────────────────────────────────────────────────────
  function renderThread (route) {
    var others = othersFromRoute(route)
    if (!others.length || !others.every(ref.isFeed)) return null
    var participants = othersOf(others) // dedupe handled below
    // build canonical participant set (self + others)
    var seenP = {}, parts = []
    ;[id].concat(others).forEach(function (f) {
      if (f && ref.isFeed(f) && !seenP[f]) { seenP[f] = true; parts.push(f) }
    })
    var cid = convIdOf(parts)
    var primary = others[0]

    var headName = others.length > 1
      ? h('span.chat-thread__name', others.length + ' people')
      : h('span.chat-thread__name', api.avatar_name(primary))

    var threadHead = h('div.chat-thread__head',
      h('a.chat-thread__who', {href: '#' + primary},
        h('div.chat-thread__avatar', api.avatar_image(primary, 'thumbnail')),
        h('div.chat-thread__id',
          headName,
          h('span.chat-thread__handle', primary.slice(0, 12) + '…')
        )
      )
    )

    var msgsCol = h('div.chat-thread__msgs')
    var scroll = h('div.chat-thread__scroll', msgsCol)

    var input = h('textarea.chat-composer__input', {
      placeholder: 'Write a message',
      rows: 1,
      onkeydown: function (ev) {
        if (ev.keyCode === 13 && !ev.shiftKey) { ev.preventDefault(); send() }
      },
      oninput: autoGrow
    })
    function autoGrow () {
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 140) + 'px'
    }
    var sendBtn = h('button.chat-composer__send', {
      type: 'button', title: 'Send', 'aria-label': 'Send', onclick: send
    }, h('span.material-symbols-outlined', {'aria-hidden': 'true'}, 'send'))

    var composer = h('div.chat-composer', input, sendBtn)

    var container = h('div.chat-thread', threadHead, scroll, composer)

    function nearBottom () {
      return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120
    }
    function toBottom () { scroll.scrollTop = scroll.scrollHeight }

    // Render the full bubble list from scratch (cheap at these limits, and it
    // reconciles optimistic sends with the real stored messages). The poll
    // calls this every few seconds; skip the DOM rebuild when the message set
    // is unchanged so it doesn't flicker or reset an open raw view.
    var lastSig = null
    function rebuild (opts) {
      var force = !!(opts && opts.force)
      var stick = force ? true : nearBottom()
      pull(
        privateStream({reverse: true, limit: 1000}),
        pull.collect(function (err, msgs) {
          if (err) return
          var mine = msgs.filter(function (m) {
            return convIdOf(participantsOf(m)) === cid
          }).sort(function (a, b) { return tsOf(a) - tsOf(b) })

          var sig = mine.map(function (m) { return m.key }).join(',')
          if (!force && sig === lastSig) return
          lastSig = sig

          msgsCol.innerHTML = ''
          if (!mine.length) {
            emptyState(msgsCol, {
              icon: 'forum',
              title: 'No messages yet',
              body: 'Say hello to start the conversation.'
            })
          } else {
            renderBubbles(msgsCol, mine)
            markSeen(cid, tsOf(mine[mine.length - 1]))
          }
          if (stick) toBottom()
        })
      )
    }

    function send () {
      var text = input.value.trim()
      if (!text) return
      input.value = ''
      autoGrow()
      // optimistic bubble
      appendOptimistic(msgsCol, text)
      toBottom()
      var content = {type: 'post', text: text, recps: parts, private: true}
      api.publish(content, function (err) {
        if (err) {
          appendError(msgsCol, err)
          return
        }
        rebuild({force: true})
      })
      input.focus()
    }

    rebuild({force: true})
    pollWhileMounted(container, function () { rebuild() })
    setTimeout(function () { input.focus(); toBottom() }, 0)
    return container
  }

  // Render messages into bubbles, grouped by consecutive author with day
  // dividers. mine (self) align right; theirs left.
  function renderBubbles (col, msgs) {
    var lastDay = null
    var lastAuthor = null
    var group = null
    msgs.forEach(function (m) {
      var ts = tsOf(m)
      var day = new Date(ts).toDateString()
      if (day !== lastDay) {
        col.appendChild(h('div.chat-day', dayLabel(ts)))
        lastDay = day
        lastAuthor = null
        group = null
      }
      var author = m.value.author
      var isMine = author === id
      if (author !== lastAuthor || !group) {
        group = h('div.chat-group' + (isMine ? '.chat-group--mine' : '.chat-group--theirs'))
        if (!isMine) group.appendChild(
          h('div.chat-group__avatar', api.avatar_image(author, 'thumbnail'))
        )
        var bubbles = h('div.chat-group__bubbles')
        group.appendChild(bubbles)
        group._bubbles = bubbles
        col.appendChild(group)
        lastAuthor = author
      }
      group._bubbles.appendChild(makeBubble(m, isMine, ts))
    })
  }

  // A single chat bubble plus a hover-revealed raw-JSON toggle that shows the
  // actual on-wire message (content is the encrypted .box blob) next to what
  // it decrypts to — so the encryption is visible and believable.
  function makeBubble (m, isMine, ts) {
    // Render only the message body — no "re:" reply line or quote chrome,
    // which message_content would prepend for messages that have a root.
    var content = m.value.content || {}
    var body = content.text ? api.markdown(content) : h('span', '🔒')
    var bodyWrap = h('div.chat-bubble__body', body)
    var bubble = h('div.chat-bubble' + (isMine ? '.chat-bubble--mine' : '.chat-bubble--theirs'), bodyWrap)
    bubble.title = new Date(ts).toLocaleString()

    var rawPre = null
    var showing = false
    var rawBtn = h('button.chat-bubble__raw',
      {type: 'button', title: 'View raw', 'aria-label': 'View raw'},
      h('span.material-symbols-outlined', {'aria-hidden': 'true'}, 'data_object'))
    rawBtn.addEventListener('click', function (ev) {
      ev.preventDefault()
      ev.stopPropagation()
      showing = !showing
      if (showing) {
        if (!rawPre) {
          var encrypted = m.boxed || {key: m.key, value: m.value}
          rawPre = h('div.chat-bubble__rawwrap',
            h('div.chat-bubble__rawlabel', 'Encrypted — as stored on the feed'),
            h('pre.chat-bubble__rawjson', h('code', JSON.stringify(encrypted, null, 2))),
            h('div.chat-bubble__rawlabel', 'Decrypts to — with your key'),
            h('pre.chat-bubble__rawjson', h('code', JSON.stringify(m.value.content, null, 2)))
          )
        }
        bodyWrap.style.display = 'none'
        bubble.appendChild(rawPre)
        bubble.classList.add('chat-bubble--raw')
      } else {
        if (rawPre && rawPre.parentNode === bubble) bubble.removeChild(rawPre)
        bodyWrap.style.display = ''
        bubble.classList.remove('chat-bubble--raw')
      }
      rawBtn.classList.toggle('chat-bubble__raw--on', showing)
      rawBtn.title = showing ? 'View message' : 'View raw'
      rawBtn.setAttribute('aria-label', rawBtn.title)
    })

    return h('div.chat-bubble-row' + (isMine ? '.chat-bubble-row--mine' : '.chat-bubble-row--theirs'),
      bubble, rawBtn)
  }

  function appendOptimistic (col, text) {
    var empty = col.querySelector('.empty-state')
    if (empty && empty.parentNode === col) col.innerHTML = ''
    var group = h('div.chat-group.chat-group--mine',
      h('div.chat-group__bubbles',
        h('div.chat-bubble.chat-bubble--mine.chat-bubble--pending',
          h('div.chat-bubble__body', text))))
    col.appendChild(group)
  }

  function appendError (col, err) {
    col.appendChild(h('div.chat-error', 'Failed to send: ' + (err.message || err)))
  }

  function dayLabel (ts) {
    var d = new Date(ts)
    var today = new Date()
    if (d.toDateString() === today.toDateString()) return 'Today'
    var yest = new Date(today.getTime() - 86400000)
    if (d.toDateString() === yest.toDateString()) return 'Yesterday'
    return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})
  }

  // ── new chat picker ─────────────────────────────────────────────────────────
  function openNewChat () {
    var input = h('input.chat-newchat__input', {
      placeholder: 'Type a name or paste a feed id (@…)',
      onkeydown: function (ev) { if (ev.keyCode === 13) start() }
    })

    function resolve () {
      var raw = input.value.trim()
      if (ref.isFeed(raw)) return raw
      var found = mentions(raw).filter(function (m) { return ref.isFeed(m.link) })
      return found.length ? found[0].link : null
    }
    function start () {
      var feed = resolve()
      if (!feed) { input.classList.add('chat-newchat__input--err'); return }
      close()
      window.location.hash = '#' + routeForOthers([feed])
    }

    var modal = h('div.chat-newchat',
      h('div.chat-newchat__card',
        h('div.chat-newchat__head', 'New chat'),
        input,
        h('div.chat-newchat__actions',
          h('button.btn.btn-primary', {type: 'button', onclick: start}, 'Start chat'),
          h('button.btn', {type: 'button', onclick: function () { close() }}, 'Cancel')
        )
      )
    )
    function onKey (ev) { if (ev.keyCode === 27) close() }
    function close () {
      document.removeEventListener('keydown', onKey)
      if (modal.parentNode) modal.parentNode.removeChild(modal)
    }
    modal.addEventListener('click', function (ev) { if (ev.target === modal) close() })
    document.addEventListener('keydown', onKey)
    document.body.appendChild(modal)
    // suggest-box measures caret coordinates against the input's live parent, so
    // wire it up only after the input is attached to the DOM.
    suggest(input, function (name, cb) {
      cont.para(api.suggest_mentions(name))(function (err, ary) {
        cb(null, (ary || []).reduce(function (a, b) {
          return b ? a.concat(b) : a
        }, []))
      })
    }, {})
    setTimeout(function () { input.focus() }, 0)
  }

  // ── live-ish refresh: re-query while the view is mounted ──────────────────
  function pollWhileMounted (el, fn) {
    var timer = setInterval(function () {
      if (!document.contains(el)) { clearInterval(timer); return }
      fn()
    }, 4000)
    if (timer && timer.unref) timer.unref && timer.unref()
  }

  // ── legacy Decent flat private stream (unchanged behaviour) ───────────────
  function renderLegacy () {
    var div = h('div.column.scroller', {style: {'overflow': 'auto'}})
    div.setAttribute('data-icon', 'lock')
    div.title = 'Private'

    var compose = api.message_compose(
      {type: 'post', recps: [], private: true},
      {
        prepublish: function (msg) {
          msg.recps = [id].concat(msg.mentions).filter(function (e) {
            return ref.isFeed('string' === typeof e ? e : e.link)
          })
          if(!msg.recps.length)
            throw new Error('cannot make private message without recipients - just mention the user in an at reply in the message you send')
          return msg
        },
        placeholder: 'Write a private message'
      }
    )

    var content = h('div.column.scroller__content')
    div.appendChild(h('div.scroller__wrapper', compose, content))

    emptyState(content, {
      icon: 'forum',
      title: 'No messages yet',
      body: 'Mention someone in a message to start a private conversation.'
    })

    pull(
      privateStream({old: false, limit: 100}),
      Scroller(div, content, api.message_render, true, false)
    )
    pull(
      privateStream({reverse: true, limit: 1000}),
      Scroller(div, content, api.message_render, false, false, function (err) {
        if(err) throw err
      })
    )
    return div
  }

  return {
    builtin_tabs: function () {
      return ['private']
    },

    screen_view: function (path) {
      if (path === 'private') {
        return isSsbskiSkin() ? renderInbox() : renderLegacy()
      }
      if (path.indexOf('dm/') === 0 && isSsbskiSkin()) {
        return renderThread(path)
      }
      return
    },

    message_meta: function (msg) {
      var content = msg.value.content
      var recps = content && content.recps
      var isEncryptedString = 'string' === typeof content
      var isPrivate = msg.value.private ||
        (content && content.private) ||
        (Array.isArray(recps) && recps.length) ||
        isEncryptedString

      if(!isPrivate) return

      return h('span.message_meta.row', map(recps, function (id) {
        return api.avatar_image_link('string' == typeof id ? id : id.link, 'thumbnail')
      }))
    },

    message_content_mini: function (msg, sbot)  {
      var isEncrypted = typeof msg.value.content === 'string'
      if(!msg.value.private && !isEncrypted) return
      if(msg.value.content && typeof msg.value.content === 'object' && msg.value.content.text)
        return
      return '🔒'
    }
  }

}
