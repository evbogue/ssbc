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
const seen = {}   // msg key -> true (dedupe render)

// Read a default remote from ?remote= / ?caps= or window.PATCHBAY_REMOTE.
const params = new URLSearchParams(location.search)
const defaultRemote = params.get('remote') || (typeof window !== 'undefined' && window.PATCHBAY_REMOTE) || ''
const defaultCaps = params.get('caps') || ''

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

function render (kv, feedId) {
  if (seen[kv.key]) return
  seen[kv.key] = true
  const v = kv.value
  const body = (v.content && (v.content.text || v.content.name)) || ('[' + (v.content && v.content.type) + ']')
  feedEl.insertBefore(
    h('div', { class: 'msg', style: 'border-bottom:1px solid #e0e0e0;padding:8px 0' }, [
      h('div', { style: 'font:12px monospace;color:#555' }, shortId(feedId || v.author) + '  ·  seq ' + v.sequence),
      h('div', {}, String(body))
    ]),
    feedEl.firstChild
  )
}

function connect () {
  const remote = remoteIn.value.trim()
  if (!remote) return setStatus('enter a node address first', false)
  setStatus('connecting…', true)
  const opts = { remote: remote }
  if (capsIn.value.trim()) opts.caps = { shs: capsIn.value.trim() }
  opts.onMessage = render
  relay = new Relay(node, opts)
  relay.connect((err) => {
    if (err) return setStatus('connect failed: ' + (err.message || err), false)
    setStatus('connected to ' + shortId(remote), true)
    relay.push(() => {})           // upload anything we already have
    relay.follow(node.id)          // live-stream our own feed back
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
  if (!id || !relay || !relay.sbot) return
  relay.follow(id)
  followIn.value = ''
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
