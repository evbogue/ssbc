'use strict'
// Pure helpers for ssbpro portable "Connect" payloads.
//
// A connect payload is a small JSON object describing an SSB identity, encoded
// as base64url and carried in a `#connect/<payload>` route or QR code. It lets
// someone view and subscribe to a feed even if their client has never replicated
// it, without inventing any new SSB message types — the payload is built from
// existing about data and a subscribe still publishes a normal `contact` follow.
//
// No DOM or depject dependencies live here so these helpers can be unit-tested
// in plain node. The route/UI handler lives in connect-view.js.
var ssbRef = require('ssb-ref')

var CONNECT_TYPE = 'ssbpro-connect'
var CONNECT_VERSION = 1

function toBase64url (str) {
  // Browserify polyfills Buffer in the web bundle, so this is UTF-8 safe in
  // both node and the browser.
  var b64 = Buffer.from(String(str), 'utf8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url (b64u) {
  var b64 = String(b64u).replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  return Buffer.from(b64, 'base64').toString('utf8')
}

function validateConnectPayload (payload) {
  if (!payload || typeof payload !== 'object') return false
  if (payload.v !== CONNECT_VERSION) return false
  if (payload.type !== CONNECT_TYPE) return false
  if (typeof payload.feed !== 'string' || !ssbRef.isFeed(payload.feed)) return false
  // Optional fields, when present, must be strings.
  if (payload.name != null && typeof payload.name !== 'string') return false
  if (payload.description != null && typeof payload.description !== 'string') return false
  if (payload.image != null && typeof payload.image !== 'string') return false
  return true
}

// Build a payload from loosely-typed profile fields, keeping only the optional
// fields that are actually present and sane. Throws if there is no valid feed.
function buildConnectPayload (fields) {
  fields = fields || {}
  if (!ssbRef.isFeed(fields.feed)) throw new Error('connect payload needs a valid feed')
  var payload = {
    v: CONNECT_VERSION,
    type: CONNECT_TYPE,
    feed: fields.feed
  }
  if (fields.name) payload.name = String(fields.name).trim().slice(0, 200)
  if (fields.description) payload.description = String(fields.description).trim().slice(0, 500)
  if (fields.image && ssbRef.isBlob(fields.image)) payload.image = fields.image
  return payload
}

function encodeConnectPayload (payload) {
  if (!validateConnectPayload(payload)) throw new Error('invalid connect payload')
  return toBase64url(JSON.stringify(payload))
}

// Returns the decoded payload, or null for anything malformed (bad base64,
// bad JSON, wrong version/type, invalid feed). Never throws.
function decodeConnectPayload (encoded) {
  var json
  try {
    json = fromBase64url(encoded)
  } catch (e) {
    return null
  }
  var payload
  try {
    payload = JSON.parse(json)
  } catch (e) {
    return null
  }
  return validateConnectPayload(payload) ? payload : null
}

// Turn arbitrary scanned/pasted text into a local `#connect/<payload>` route so
// every entry point (QR scan, image upload, paste) funnels through the same
// confirmation card. Handles our own connect QR (a full URL), a bare connect
// payload, and a plain feed id / profile link (wrapped into a minimal payload).
// Returns null when nothing usable is found.
function connectRouteFromText (text) {
  text = String(text || '').trim()
  if (!text) return null
  var marker = '#connect/'
  var idx = text.indexOf(marker)
  var encoded = idx >= 0 ? text.slice(idx + marker.length) : text
  if (decodeConnectPayload(encoded)) return marker + encoded
  var feed = ssbRef.extract(text)
  if (ssbRef.isFeed(feed)) return marker + encodeConnectPayload(buildConnectPayload({feed: feed}))
  return null
}

module.exports = {
  CONNECT_TYPE: CONNECT_TYPE,
  CONNECT_VERSION: CONNECT_VERSION,
  buildConnectPayload: buildConnectPayload,
  validateConnectPayload: validateConnectPayload,
  encodeConnectPayload: encodeConnectPayload,
  decodeConnectPayload: decodeConnectPayload,
  connectRouteFromText: connectRouteFromText
}
