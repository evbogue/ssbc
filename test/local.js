'use strict'

const test = require('tape')
const local = require('../lib/vendor/ssb-local')

test('ssb-local parses multiserver addresses without ssb-ref deprecation helpers', (t) => {
  const peer = local._parsePeerAddress('net:127.0.0.1:8008~shs:W1b6w3l7x8mT5w6l6J7I8x9rY0zA1b2c3d4e5f6g7h8=')

  t.deepEqual(peer, {
    host: '127.0.0.1',
    port: 8008,
    key: '@W1b6w3l7x8mT5w6l6J7I8x9rY0zA1b2c3d4e5f6g7h8=.ed25519'
  })
  t.end()
})

test('ssb-local ignores malformed peer addresses', (t) => {
  t.equal(local._parsePeerAddress('not-an-address'), null)
  t.end()
})

test('ssb-local detects loopback beacons from local interfaces', (t) => {
  t.equal(local._isLoopbackPeer({ address: '127.0.0.1', port: 8008 }, 8008, { '127.0.0.1': true }), true)
  t.equal(local._isLoopbackPeer({ address: '192.168.1.2', port: 8008 }, 8008, { '127.0.0.1': true }), false)
  t.end()
})
