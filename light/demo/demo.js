'use strict'

// A standalone, serverless SSB client in one page. It generates an identity in
// the browser, connects to a real SSB node over WebSocket (secret-handshake +
// muxrpc), and shows a feed updating live — publishing rides straight back
// through the relay so your own posts appear as they replicate.
//
// Build to a self-contained index.html with light/demo/build.js.

const Light = require('../light')
const Relay = require('../relay')

// --- tiny DOM helpers ------------------------------------------------------
function h (tag, attrs, children) {
  const el = document.createElement(tag)
  attrs = attrs || {}
  for (const k in attrs) {
    if (k === 'onclick') el.addEventListener('click', attrs[k])
    else if (k === 'style') el.setAttribute('style', attrs[k])
    else if (k in el) el[k] = attrs[k]
    else el.setAttribute(k, attrs[k])
  }
  ;[].concat(children || []).forEach((c) => {
    if (c == null) return
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  })
  return el
}
function shortId (id) { return id.slice(0, 12) + '…' + id.slice(-6) }

// --- state -----------------------------------------------------------------
const node = new Light()
let relay = null
const seen = {}          // msg key -> true (dedupe)
const messages = []      // { kv, feedId } — everything we've seen, rendered sorted

// Where the demo remembers your last connection between reloads.
const LS_REMOTE = 'ssb-light/demo/remote'
const LS_CAPS   = 'ssb-light/demo/caps'
function lsGet (k) { try { return localStorage.getItem(k) } catch (_) { return null } }
function lsSet (k, v) { try { localStorage.setItem(k, v) } catch (_) {} }

// Read a default remote from ?remote= / a saved value / window.PATCHBAY_REMOTE.
const params = new URLSearchParams(location.search)
const defaultRemote = params.get('remote') || lsGet(LS_REMOTE) || (typeof window !== 'undefined' && window.PATCHBAY_REMOTE) || ''
// Autoload the main SSB network caps so the field shows which network we join;
// ?caps= or a saved value overrides, and clearing the field also falls back.
const defaultCaps = params.get('caps') || lsGet(LS_CAPS) || Relay.MAIN_CAPS.shs

// --- UI --------------------------------------------------------------------
const feedEl   = h('div', { id: 'feed' })
const statusEl = h('span', { id: 'status', textContent: 'not connected' })
const remoteIn = h('input', { id: 'remote', placeholder: 'ws://host:port~shs:<pubkey>', value: defaultRemote, style: 'width:100%;box-sizing:border-box' })
const capsIn   = h('input', { id: 'caps', placeholder: 'network caps (blank = main SSB network)', value: defaultCaps, style: 'width:100%;box-sizing:border-box' })
const followIn = h('input', { id: 'follow', placeholder: 'a feed id to follow: @…​.ed25519', style: 'width:100%;box-sizing:border-box' })
const postIn   = h('textarea', { id: 'post', placeholder: 'write a post…', rows: 3, style: 'width:100%;box-sizing:border-box' })

function setStatus (text, ok) {
  statusEl.textContent = text
  statusEl.setAttribute('style', 'font-weight:600;color:' + (ok ? '#137333' : '#b3261e'))
}

function msgBody (v) {
  const c = v.content
  if (c && c.type === 'contact' && c.contact)
    return (c.following === false ? 'unfollowed ' : 'followed ') + shortId(c.contact)
  return (c && (c.text || c.name)) || ('[' + (c && c.type) + ']')
}

function msgEl (kv, feedId) {
  const v = kv.value
  return h('div', { class: 'msg', style: 'border-bottom:1px solid #e0e0e0;padding:8px 0' }, [
    h('div', { style: 'font:12px monospace;color:#555' },
      shortId(feedId || v.author) + '  ·  seq ' + v.sequence +
      (v.author === node.id ? '  ·  you' : '')),
    h('div', {}, String(msgBody(v)))
  ])
}

// Collect a message once, then re-render the whole feed newest-first. A full
// re-render keeps a mixed multi-feed timeline correctly ordered whether messages
// arrive live or are replayed in a batch from storage on load.
function render (kv, feedId) {
  if (seen[kv.key]) return
  seen[kv.key] = true
  messages.push({ kv: kv, feedId: feedId || kv.value.author })
  renderFeed()
}

function renderFeed () {
  messages.sort((a, b) => (b.kv.value.timestamp || 0) - (a.kv.value.timestamp || 0))
  while (feedEl.firstChild) feedEl.removeChild(feedEl.firstChild)
  for (let i = 0; i < messages.length; i++) feedEl.appendChild(msgEl(messages[i].kv, messages[i].feedId))
}

// (Re)build the relay from the current form fields. The Relay constructor
// reloads any feeds we synced in a previous session from storage, so this also
// primes relay.feeds for rendering — no connection needed.
function buildRelay () {
  const opts = { remote: remoteIn.value.trim(), onMessage: render }
  const caps = capsIn.value.trim()
  if (caps) opts.caps = { shs: caps }
  relay = new Relay(node, opts)
  return relay
}

// Render everything already on disk: our own feed plus every synced feed the
// relay reloaded. Called on load so a refresh shows history immediately.
function renderPersisted () {
  node.log().forEach((kv) => render(kv, node.id))
  if (relay) Object.keys(relay.feeds).forEach((fid) => relay.feeds[fid].forEach((kv) => render(kv, fid)))
}

// Pull our follow graph down and keep every followed feed live.
function resubscribe () {
  if (!relay || !relay.sbot) return
  relay.syncFollows({ hops: 1 }, () => {
    relay.following().forEach((id) => relay.follow(id))
  })
}

function connect () {
  const remote = remoteIn.value.trim()
  if (!remote) return setStatus('enter a node address first', false)
  lsSet(LS_REMOTE, remote)                 // remember for next time
  lsSet(LS_CAPS, capsIn.value.trim())
  setStatus('connecting…', true)
  buildRelay()
  relay.connect((err) => {
    if (err) return setStatus('connect failed: ' + (err.message || err), false)
    setStatus('connected to ' + shortId(remote), true)
    relay.push(() => {})           // upload anything we already have
    relay.follow(node.id)          // live-stream our own feed back
    resubscribe()                  // pull + stay live on everyone we follow
  })
}

function publish () {
  const text = postIn.value.trim()
  if (!text) return
  const kv = node.publish({ type: 'post', text: text })
  postIn.value = ''
  render(kv, node.id)              // optimistic: show immediately
  if (relay && relay.sbot) relay.push(() => {})   // send it up to the relay
}

function follow () {
  const id = followIn.value.trim()
  if (!id || id[0] !== '@') return
  followIn.value = ''
  // Record a real follow in our own feed: it persists with our log and, once
  // pushed, propagates as a normal SSB contact message the network understands.
  const kv = node.publish({ type: 'contact', contact: id, following: true })
  render(kv, node.id)
  if (relay && relay.sbot) {
    relay.push(() => {})           // push the contact message up
    relay.follow(id)               // and start live-streaming the feed
  }
}

function mount () {
  const wrap = 'max-width:640px;margin:24px auto;font-family:system-ui,sans-serif;padding:0 16px'
  document.body.appendChild(h('div', { style: wrap }, [
    h('h2', {}, 'SSB light node'),
    h('div', { style: 'font:12px monospace;color:#555;word-break:break-all;margin-bottom:4px' }, ['you: ', node.id]),
    h('div', { style: 'margin:8px 0' }, [statusEl]),
    h('label', {}, 'Relay node'), remoteIn,
    capsIn,
    h('button', { onclick: connect, style: 'margin:8px 0' }, 'Connect'),
    h('hr'),
    h('label', {}, 'Post'), postIn,
    h('button', { onclick: publish }, 'Publish'),
    h('hr'),
    h('label', {}, 'Follow a feed'), followIn,
    h('button', { onclick: follow, style: 'margin:8px 0' }, 'Follow'),
    h('hr'),
    h('h3', {}, 'Feed'), feedEl
  ]))

  // Show what's already on disk before any network: our own feed, plus every
  // feed we synced in a past session (buildRelay reloads them from storage).
  buildRelay()
  renderPersisted()

  // If we have a remembered relay, reconnect automatically and resume the graph.
  if (defaultRemote) connect()
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
  else mount()
}

// exported for automated (headless) testing
module.exports = {
  node,
  connect: () => connect(),
  publish: (t) => { postIn.value = t; publish() },
  follow: (id) => { followIn.value = id; follow() },
  status: () => statusEl.textContent,
  feedText: () => feedEl.textContent,
  _render: render
}
if (typeof window !== 'undefined') window.__demo = module.exports
