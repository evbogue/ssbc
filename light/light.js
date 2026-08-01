'use strict'

// light.js — a serverless "essentials only" SSB node for the browser.
//
// It does the three things you actually need to participate in the protocol,
// with no sbot server and no network:
//
//   1. make a keypair               -> Light#id / Light#keys
//   2. sign & publish a message     -> Light#publish(content)
//   3. verify messages / feeds      -> Light#verify(msg) / Light#verifyChain(msgs)
//
// Everything here is pure JavaScript. `ssb-keys` runs in the browser via
// chloride's `browser` field (sodium-browserify/tweetnacl), and `ssb-validate`
// builds and checks the exact canonical message form the wider network expects.
// The only thing a light node cannot do on its own is *gossip* — pushing these
// signed messages to other peers still needs a WebSocket relay (a pub/room).
//
// Storage is pluggable. In a browser it defaults to localStorage; in Node (or a
// test) it falls back to an in-memory store so the same module runs in both.

const ssbKeys  = require('ssb-keys')
const validate = require('ssb-validate')

const KEY_SECRET = 'ssb-light/secret'
const KEY_LOG    = 'ssb-light/log'

// A minimal Storage-like shim so the module has no hard dependency on the DOM.
function memoryStore () {
  const mem = Object.create(null)
  return {
    getItem: function (k) { return k in mem ? mem[k] : null },
    setItem: function (k, v) { mem[k] = String(v) },
    removeItem: function (k) { delete mem[k] }
  }
}

function defaultStore () {
  if (typeof localStorage !== 'undefined') return localStorage
  return memoryStore()
}

// Load an existing identity from the store, or generate a fresh one and persist
// it. This mirrors what decent/src/keys.js already does in the browser today.
function loadOrCreateKeys (store) {
  try {
    const stored = store.getItem(KEY_SECRET)
    if (stored && stored !== 'undefined') return JSON.parse(stored)
  } catch (_) {}

  const keys = ssbKeys.generate('ed25519')
  try { store.setItem(KEY_SECRET, JSON.stringify(keys, null, 2)) } catch (_) {}
  return keys
}

function Light (opts) {
  if (!(this instanceof Light)) return new Light(opts)
  opts = opts || {}

  this.store   = opts.store || defaultStore()
  this.hmacKey = opts.caps ? opts.caps.sign : null   // main net = null
  this.keys    = opts.keys || loadOrCreateKeys(this.store)
  this.id      = this.keys.id

  // `state` is the running validation state. Rebuilding it from the persisted
  // log is exactly how a real client bootstraps: replay every stored message
  // through the validator so the chain is proven, not just trusted.
  this.state = validate.initial()

  const log = this._readLog()
  for (let i = 0; i < log.length; i++) {
    // append() verifies signature, sequence, and previous-hash linkage; it
    // throws if the persisted log was tampered with.
    this.state = validate.append(this.state, this.hmacKey, log[i].value)
  }
  this._log = log
}

// --- persistence -----------------------------------------------------------

Light.prototype._readLog = function () {
  try {
    const raw = this.store.getItem(KEY_LOG)
    if (raw && raw !== 'undefined') return JSON.parse(raw)
  } catch (_) {}
  return []
}

Light.prototype._writeLog = function () {
  try { this.store.setItem(KEY_LOG, JSON.stringify(this._log)) } catch (_) {}
}

// --- the essentials --------------------------------------------------------

// publish(content) -> { key, value }
// Builds the next message in this feed, signs it, links it to the previous
// message, computes its id, appends it to the local log, and persists.
Light.prototype.publish = function (content, timestamp) {
  if (timestamp == null) timestamp = Date.now()

  // create() reads this feed's tip (id + sequence) out of state and produces a
  // fully-signed message value in canonical form.
  const feedState = this.state.feeds[this.id] // undefined for the very first msg

  // ssb-validate requires strictly-increasing timestamps within a feed. Two
  // publishes in the same millisecond would otherwise collide and throw, so
  // advance past the feed's previous timestamp (monotonic clock).
  if (feedState && timestamp <= feedState.timestamp) timestamp = feedState.timestamp + 1
  const value = validate.create(feedState, this.keys, this.hmacKey, content, timestamp)

  // append() re-validates the message we just made and advances feed state.
  this.state = validate.append(this.state, this.hmacKey, value)

  const kv = { key: validate.id(value), value: value }
  this._log.push(kv)
  this._writeLog()
  return kv
}

// box(content, recipients) -> encrypted ".box" string. Encrypts content to a
// list of feed ids (private-box / ssb-private1). Up to 7 recipients.
Light.prototype.box = function (content, recipients) {
  return ssbKeys.box(content, recipients)
}

// publishPrivate(content, recipients) -> { key, value }
// Encrypts content to the recipients (ourselves always included so we can read
// it back) and publishes it as a normal message with an encrypted body. On the
// wire it's an opaque ".box" string; only recipients can decrypt it.
Light.prototype.publishPrivate = function (content, recipients, timestamp) {
  if (!Array.isArray(recipients) || recipients.length === 0)
    throw new Error('recipients must be a non-empty array of feed ids')
  const recps = recipients.indexOf(this.id) === -1 ? recipients.concat(this.id) : recipients
  if (recps.length > 7) throw new Error('at most 7 recipients (including yourself)')
  return this.publish(ssbKeys.box(content, recps), timestamp)
}

// unbox(msg) -> content | null. Decrypts a private message addressed to us,
// returning the plaintext content, or null if it isn't ours to read (or isn't
// a private message at all).
Light.prototype.unbox = function (msg) {
  const value = msg && msg.value ? msg.value : msg
  const c = value && value.content
  if (typeof c !== 'string') return null
  const opened = ssbKeys.unbox(c, this.keys)
  return opened || null
}

// verify(msg) -> boolean. Checks one message's ed25519 signature.
Light.prototype.verify = function (msg) {
  const value = msg && msg.value ? msg.value : msg
  return ssbKeys.verifyObj(this.keys, this.hmacKey, value)
}

// verifyChain(msgs) -> boolean. Validates an entire feed: every signature, and
// that each message correctly links (sequence + previous hash) to the one
// before it. Returns false instead of throwing on a broken chain.
Light.prototype.verifyChain = function (msgs) {
  let state = validate.initial()
  try {
    for (let i = 0; i < msgs.length; i++) {
      const value = msgs[i].value ? msgs[i].value : msgs[i]
      state = validate.append(state, this.hmacKey, value)
    }
    return true
  } catch (_) {
    return false
  }
}

// getLatest() -> { key, value } | null. This feed's current tip.
Light.prototype.getLatest = function () {
  return this._log.length ? this._log[this._log.length - 1] : null
}

// log() -> array of { key, value } — the whole feed as stored locally.
Light.prototype.log = function () {
  return this._log.slice()
}

module.exports = Light
