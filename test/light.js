'use strict'

// Proves the "light" browser node needs no server: it generates an identity,
// signs and links a feed, verifies it, detects tampering, and survives a
// storage round-trip — all with pure-JS ssb-keys + ssb-validate.

const test     = require('tape')
const ssbKeys  = require('ssb-keys')
const validate = require('ssb-validate')
const Light    = require('../light/light')

// An in-memory Storage-like shim, shared across instances to exercise reload.
function sharedStore () {
  const mem = Object.create(null)
  return {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v) },
    removeItem: (k) => { delete mem[k] }
  }
}

test('light node: identity, signing and publishing need no server', (t) => {
  const store = sharedStore()
  const node = new Light({ store })

  t.ok(/^@[A-Za-z0-9/+]+=\.ed25519$/.test(node.id), 'generated an ed25519 identity')

  const a = node.publish({ type: 'post', text: 'hello from a browser' })
  const b = node.publish({ type: 'post', text: 'second message' })
  const c = node.publish({ type: 'contact', contact: node.id, following: true })

  t.equal(a.value.sequence, 1, 'first message is sequence 1')
  t.equal(a.value.previous, null, 'first message has no previous')
  t.equal(b.value.previous, a.key, 'second message links to first via previous-hash')
  t.equal(c.value.previous, b.key, 'third message links to second')
  t.equal(a.value.author, node.id, 'messages are authored by our feed')

  const recomputed = '%' + ssbKeys.hash(JSON.stringify(a.value, null, 2))
  t.equal(recomputed, a.key, 'message id = sha256 of canonical JSON (recomputed independently)')

  t.end()
})

test('light node: verification and tamper detection', (t) => {
  const node = new Light({ store: sharedStore() })
  const a = node.publish({ type: 'post', text: 'signed message' })
  const b = node.publish({ type: 'post', text: 'next' })

  t.equal(node.verify(a), true, 'a good signature verifies')
  t.equal(node.verifyChain([a, b]), true, 'a linked, signed feed validates')

  const forged = JSON.parse(JSON.stringify(a))
  forged.value.content.text = 'tampered'
  t.equal(node.verify(forged), false, 'tampered content fails signature verification')
  t.equal(node.verifyChain([a]), true, 'single valid message is a valid chain')
  t.equal(node.verifyChain([b, a]), false, 'a chain with a broken link is rejected')

  t.end()
})

test('light node: messages are real SSB messages any peer would accept', (t) => {
  const node = new Light({ store: sharedStore() })
  const a = node.publish({ type: 'post', text: 'one' })
  const b = node.publish({ type: 'post', text: 'two' })

  // A fresh, independent validator with no shared state accepts the feed.
  let peer = validate.initial()
  peer = validate.append(peer, null, a.value)
  peer = validate.append(peer, null, b.value)
  t.equal(peer.feeds[node.id].sequence, 2, 'an independent peer validates the feed to seq 2')

  t.end()
})

test('light node: private (encrypted) messages', (t) => {
  const A = new Light({ store: sharedStore() })
  const B = new Light({ store: sharedStore() })
  const C = new Light({ store: sharedStore() })

  // A sends B a private message.
  const pm = A.publishPrivate({ type: 'post', text: 'for your eyes only' }, [B.id])

  t.equal(typeof pm.value.content, 'string', 'on the wire the content is an opaque string')
  t.ok(/\.box$/.test(pm.value.content), 'content is a .box ciphertext')
  t.equal(A.verify(pm), true, 'the private message is still a validly signed message')

  t.deepEqual(B.unbox(pm), { type: 'post', text: 'for your eyes only' }, 'recipient B can decrypt it')
  t.deepEqual(A.unbox(pm), { type: 'post', text: 'for your eyes only' }, 'sender A can decrypt it too (self is a recipient)')
  t.equal(C.unbox(pm), null, 'a non-recipient C cannot decrypt it')

  const pub = A.publish({ type: 'post', text: 'public' })
  t.equal(A.unbox(pub), null, 'unbox returns null for a normal public message')

  t.throws(() => A.publishPrivate({ text: 'x' }, []), /recipients/, 'rejects an empty recipient list')

  t.end()
})

test('light node: identity and feed persist across a storage reload', (t) => {
  const store = sharedStore()
  const first = new Light({ store })
  const a = first.publish({ type: 'post', text: 'before reload' })
  const b = first.publish({ type: 'post', text: 'still before' })

  // A brand-new instance over the same store reloads everything and continues.
  const reopened = new Light({ store })
  t.equal(reopened.id, first.id, 'reopened node has the same identity')
  t.equal(reopened.log().length, 2, 'reopened node reloaded all messages')

  const c = reopened.publish({ type: 'post', text: 'after reload' })
  t.equal(c.value.sequence, 3, 'chain continues at the right sequence')
  t.equal(c.value.previous, b.key, 'chain links to the pre-reload tip')

  t.end()
})
