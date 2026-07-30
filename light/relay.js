'use strict'

// relay.js — connect a light node (light/light.js) to a REAL SSB node and keep
// its feed synced through that node, which acts as a relay to the wider network.
//
// A light node can create and verify a valid feed entirely on its own, but it
// can't gossip — browsers have no raw TCP. This module gives it the one thing it
// was missing: a connection to an always-on peer (a pub/room, or any sbot that
// speaks WebSocket) over the real SSB protocol — secret-handshake + muxrpc — and
// classic replication on top of it:
//
//   * push  — upload our own signed messages to the relay via `add`
//   * pull  — download other feeds from the relay via `createHistoryStream`,
//             validating every message before we keep it
//
// The transport is the same stack the Decent frontend already browserifies
// (`ssb-client` → secret-stack → multiserver ws + muxrpc), so this runs in the
// browser. It stays "light" because replication is plain history streams — no
// flume, no EBT, no server-side plugins.

const pull         = require('pull-stream')
const createClient = require('ssb-client')
const validate     = require('ssb-validate')

// The main SSB network's application capability (shs key). Override via
// opts.caps.shs to join a different network.
const MAIN_CAPS = { shs: '1KHLiKZvAvjbY1ziZEHMXawbCEIM6qwjCDm3VYRan/s=' }

// The muxrpc methods a light relay needs from the remote. Real pubs expose all
// of these at the top level (they come from ssb-db); gossip.connect lets us ask
// the relay to dial further peers.
const MANIFEST = {
  createHistoryStream: 'source',
  add:                 'async',
  whoami:              'sync',
  gossip:              { connect: 'async', peers: 'sync' }
}

function Relay (light, opts) {
  if (!(this instanceof Relay)) return new Relay(light, opts)
  opts = opts || {}

  this.light     = light
  this.remote    = opts.remote               // ws://host:port~shs:<pubkey>
  this.caps      = opts.caps || MAIN_CAPS
  this.manifest  = opts.manifest || MANIFEST
  this.hmacKey   = light.hmacKey || null      // message-signing hmac (null = main net)
  this.onMessage = opts.onMessage || function () {}

  this.sbot  = null
  this.feeds = {}                             // feedId -> [ { key, value } ] we pulled
  this._live = {}                             // feedId -> abort fn for live streams

  // Replication state across every feed we track, seeded with our own log so
  // history resumes at the right sequence and the relay echoing our own
  // messages back is recognised as duplicate rather than re-stored.
  this.state = validate.initial()
  const log = light.log()
  for (let i = 0; i < log.length; i++)
    this.state = validate.append(this.state, this.hmacKey, log[i].value)
}

// connect([cb]) — open the secret-handshake + muxrpc session to the relay.
Relay.prototype.connect = function (cb) {
  const self = this
  createClient(this.light.keys, {
    remote:   this.remote,
    caps:     { shs: this.caps.shs },
    manifest: this.manifest
  }, function (err, sbot) {
    if (err) return cb && cb(err)
    self.sbot = sbot
    sbot.on('closed', function () { self.sbot = null })
    if (cb) cb(null, sbot)
  })
  return this
}

// push([cb]) — upload our own feed to the relay. Idempotent: the relay dedupes,
// and we swallow "already have it" style errors so re-pushing is safe.
Relay.prototype.push = function (cb) {
  const self = this
  if (!self.sbot) return cb && cb(new Error('not connected'))
  const log = self.light.log()
  let i = 0
  ;(function next () {
    if (i >= log.length) return cb && cb(null, log.length)
    const msg = log[i++]
    self.sbot.add(msg.value, function (err) {
      if (err && !/already|exists|expected apply|no such|receive/i.test(err.message || ''))
        return cb && cb(err)
      next()
    })
  })()
  return this
}

// pull(feedId, [opts], [cb]) — download a feed from the relay, validating and
// linking every message before keeping it. Resumes from the last sequence we
// have for that feed. opts.live keeps the stream open for new messages.
Relay.prototype.pull = function (feedId, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {} }
  opts = opts || {}
  const self = this
  if (!self.sbot) return cb && cb(new Error('not connected'))

  const fs      = self.state.feeds[feedId]
  const fromSeq = (fs ? fs.sequence : 0) + 1
  const live    = !!opts.live

  const stream = self.sbot.createHistoryStream({ id: feedId, seq: fromSeq, live: live, keys: false })
  const sink = pull.drain(function (value) {
    try {
      // append() enforces signature, sequence and previous-hash linkage; a bad
      // or out-of-order message throws and is skipped rather than kept.
      self.state = validate.append(self.state, self.hmacKey, value)
    } catch (e) { return }
    const kv = { key: validate.id(value), value: value }
    ;(self.feeds[feedId] = self.feeds[feedId] || []).push(kv)
    self.onMessage(kv, feedId)
  }, function (err) {
    delete self._live[feedId]
    if (cb) cb(err)
  })

  if (live) self._live[feedId] = sink.abort ? sink.abort.bind(sink) : function () {}
  pull(stream, sink)
  return this
}

// follow(feedId, [cb]) — like pull, but stays live.
Relay.prototype.follow = function (feedId, cb) {
  return this.pull(feedId, { live: true }, cb)
}

// sync(feeds, [cb]) — one-shot: push our feed up, then pull each listed feed
// down. This is the "keep everything synced through the relay" round-trip.
Relay.prototype.sync = function (feeds, cb) {
  const self = this
  self.push(function (err) {
    if (err) return cb && cb(err)
    const list = (feeds || []).slice()
    let i = 0
    ;(function next (err) {
      if (err) return cb && cb(err)
      if (i >= list.length) return cb && cb(null)
      self.pull(list[i++], { live: false }, next)
    })()
  })
  return this
}

// get(feedId) — messages we've pulled for a feed.
Relay.prototype.get = function (feedId) {
  return (this.feeds[feedId] || []).slice()
}

// ask the relay to dial another peer on our behalf (extends reach).
Relay.prototype.gossipConnect = function (addr, cb) {
  if (!this.sbot) return cb && cb(new Error('not connected'))
  this.sbot.gossip.connect(addr, cb || function () {})
  return this
}

Relay.prototype.close = function (cb) {
  Object.keys(this._live).forEach((id) => { try { this._live[id]() } catch (_) {} })
  if (this.sbot && this.sbot.close) this.sbot.close(cb)
  else if (cb) cb()
}

module.exports = Relay
