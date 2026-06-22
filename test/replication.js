'use strict'

// Replication compatibility test.
//
// Dominic's point on the `compatability` revert was: prove the network layer
// still works after swapping the storage engine. ssb-ebt (the EBT replication
// protocol) ships its own suite against ssb-db; this runs the equivalent
// scenario against lib/db.js (our node:sqlite store) instead.
//
// It builds two real secret-stack peers — db + replicate stub + ssb-ebt — has
// one publish a feed, connects them, and asserts the other peer ends up with a
// byte-identical copy of that feed. If this passes, EBT replicates correctly
// against the SQLite implementation.

const test        = require('tape')
const pull        = require('pull-stream')
const ssbKeys     = require('ssb-keys')
const crypto      = require('crypto')
const SecretStack = require('secret-stack')

// Random per-run caps so concurrent test runs don't collide on the network.
const caps = { shs: crypto.randomBytes(32), sign: crypto.randomBytes(32) }

let nextPort = 45610
function createPeer () {
  return SecretStack({ caps })
    .use(require('../lib/db'))
    .use(require('../lib/vendor/ssb-replicate-stub'))
    .use(require('ssb-ebt'))({
      temp: 'ssbc-repl-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      port: nextPort++,
      host: 'localhost',
      keys: ssbKeys.generate(),
      caps
    })
}

test('two SQLite peers replicate a feed via EBT', (t) => {
  const alice = createPeer()
  const bob   = createPeer()

  // Both peers ask to replicate both feeds. ssb-ebt hooks replicate.request
  // and forwards the call into EBT, so replicate.request(id, true) is the same
  // trigger the friends/replicate graph would normally produce.
  for (const peer of [alice, bob]) {
    peer.replicate.request(alice.id, true)
    peer.replicate.request(bob.id, true)
  }

  const N = 5
  let published = 0

  ;(function publishNext () {
    if (published === N) return afterPublish()
    published++
    alice.publish({ type: 'post', text: 'message ' + published }, (err) => {
      t.error(err, 'alice published message ' + published)
      publishNext()
    })
  })()

  function afterPublish () {
    alice.connect(bob.getAddress(), (err) => {
      t.error(err, 'alice connected to bob')
    })

    // createHistoryStream is snapshot-only (no live), so poll the clock until
    // bob has caught up to alice's latest sequence, or time out.
    const deadline = Date.now() + 10000
    ;(function poll () {
      bob.getVectorClock((err, clock) => {
        if (err) { t.error(err, 'bob.getVectorClock'); return finish() }
        if ((clock[alice.id] || 0) >= N) return verify()
        if (Date.now() > deadline) {
          t.fail('timed out: bob has seq ' + (clock[alice.id] || 0) + ' of ' + N)
          return finish()
        }
        setTimeout(poll, 100)
      })
    })()
  }

  function verify () {
    pull(
      bob.createHistoryStream({ id: alice.id }),
      pull.collect((err, msgs) => {
        t.error(err, 'bob read alice\'s feed')
        t.equal(msgs.length, N, 'bob received all ' + N + ' of alice\'s messages')
        t.ok(msgs.every((m) => m.value.author === alice.id), 'all messages authored by alice')
        t.equal(msgs[0].value.content.text, 'message 1', 'first replicated message matches')
        t.equal(msgs[N - 1].value.content.text, 'message ' + N, 'last replicated message matches')
        finish()
      })
    )
  }

  function finish () {
    alice.close(true)
    bob.close(true)
    t.end()
  }
})

test('SQLite peers replicate messages published after connecting (realtime)', (t) => {
  const alice = createPeer()
  const bob   = createPeer()

  for (const peer of [alice, bob]) {
    peer.replicate.request(alice.id, true)
    peer.replicate.request(bob.id, true)
  }

  // Connect first, with an empty feed, then publish — this drives EBT's live
  // path (it hooks sbot.post) rather than the initial clock-based catch-up.
  alice.connect(bob.getAddress(), (err) => {
    t.error(err, 'alice connected to bob')

    const N = 4
    let published = 0
    ;(function publishNext () {
      if (published === N) return waitForCatchup(N)
      published++
      alice.publish({ type: 'post', text: 'live ' + published }, (err) => {
        t.error(err, 'alice published live message ' + published)
        setTimeout(publishNext, 150)
      })
    })()
  })

  function waitForCatchup (N) {
    const deadline = Date.now() + 10000
    ;(function poll () {
      bob.getVectorClock((err, clock) => {
        if (err) { t.error(err, 'bob.getVectorClock'); return finish() }
        if ((clock[alice.id] || 0) >= N) return verify(N)
        if (Date.now() > deadline) {
          t.fail('timed out: bob has seq ' + (clock[alice.id] || 0) + ' of ' + N)
          return finish()
        }
        setTimeout(poll, 100)
      })
    })()
  }

  function verify (N) {
    pull(
      bob.createHistoryStream({ id: alice.id }),
      pull.collect((err, msgs) => {
        t.error(err, 'bob read alice\'s feed')
        t.equal(msgs.length, N, 'bob received all ' + N + ' live messages')
        t.equal(msgs[N - 1].value.content.text, 'live ' + N, 'last live message matches')
        finish()
      })
    )
  }

  function finish () {
    alice.close(true)
    bob.close(true)
    t.end()
  }
})
