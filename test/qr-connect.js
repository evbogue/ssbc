'use strict'

const test = require('tape')
const qr = require('../decent/src/modules/ui/qr-connect')

const FEED = '@YPASFgN1LXIB6KH9N3fNxv1fA2STq2UoxlXN4ZnBT7A=.ed25519'
const BLOB = '&MbMTbXOJJLzNfh6ta0pKScrwp0fS1BJiogcUqPTTa1o=.sha256'

test('encode/decode round trip with all fields', (t) => {
  const payload = qr.buildConnectPayload({
    feed: FEED,
    name: 'Ada Lovelace',
    description: 'Mathematician. Writes about analytical engines.',
    image: BLOB
  })
  const encoded = qr.encodeConnectPayload(payload)
  t.equal(typeof encoded, 'string', 'encodes to a string')
  t.notOk(/[+/=]/.test(encoded), 'is base64url (no +, /, or = padding)')

  const decoded = qr.decodeConnectPayload(encoded)
  t.deepEqual(decoded, payload, 'decodes back to the same payload')
  t.equal(decoded.v, qr.CONNECT_VERSION, 'carries version')
  t.equal(decoded.type, qr.CONNECT_TYPE, 'carries type')
  t.end()
})

test('round trip with only required feed field', (t) => {
  const payload = qr.buildConnectPayload({ feed: FEED })
  t.deepEqual(Object.keys(payload).sort(), ['feed', 'type', 'v'], 'omits empty optional fields')
  const decoded = qr.decodeConnectPayload(qr.encodeConnectPayload(payload))
  t.deepEqual(decoded, payload, 'round trips')
  t.end()
})

test('unicode names survive the round trip', (t) => {
  const payload = qr.buildConnectPayload({ feed: FEED, name: 'Ådä — 日本語 😀' })
  const decoded = qr.decodeConnectPayload(qr.encodeConnectPayload(payload))
  t.equal(decoded.name, 'Ådä — 日本語 😀', 'utf-8 preserved')
  t.end()
})

test('buildConnectPayload drops a non-blob image and rejects a bad feed', (t) => {
  const payload = qr.buildConnectPayload({ feed: FEED, image: 'not-a-blob' })
  t.notOk('image' in payload, 'non-blob image is dropped')
  t.throws(() => qr.buildConnectPayload({ feed: 'nope' }), /valid feed/, 'invalid feed throws')
  t.end()
})

test('validateConnectPayload rejects malformed payloads', (t) => {
  t.notOk(qr.validateConnectPayload(null), 'null')
  t.notOk(qr.validateConnectPayload({}), 'empty object')
  t.notOk(qr.validateConnectPayload({ v: 1, type: qr.CONNECT_TYPE, feed: 'nope' }), 'bad feed id')
  t.notOk(qr.validateConnectPayload({ v: 99, type: qr.CONNECT_TYPE, feed: FEED }), 'wrong version')
  t.notOk(qr.validateConnectPayload({ v: 1, type: 'other', feed: FEED }), 'wrong type')
  t.notOk(qr.validateConnectPayload({ v: 1, type: qr.CONNECT_TYPE, feed: FEED, name: 5 }), 'non-string name')
  t.ok(qr.validateConnectPayload({ v: 1, type: qr.CONNECT_TYPE, feed: FEED }), 'minimal valid payload')
  t.end()
})

test('decodeConnectPayload returns null for garbage instead of throwing', (t) => {
  t.equal(qr.decodeConnectPayload('!!!not base64!!!'), null, 'bad base64')
  t.equal(qr.decodeConnectPayload(Buffer.from('not json', 'utf8').toString('base64url')), null, 'bad json')
  t.equal(qr.decodeConnectPayload(Buffer.from(JSON.stringify({ v: 1 }), 'utf8').toString('base64url')), null, 'incomplete payload')
  t.equal(qr.decodeConnectPayload(''), null, 'empty string')
  t.end()
})
