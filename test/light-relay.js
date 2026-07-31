'use strict'

// Proves a light node can use a REAL SSB node as a relay: it connects over
// secret-handshake + muxrpc (WebSocket transport), pushes its own signed feed
// up, and pulls other feeds down — the same round-trip that keeps a browser
// client synced with the network. The "pub" here is a genuine secret-stack node
// with ssb-ws; only its storage is a small in-memory ssb-validate log.

const test         = require('tape')
const pull         = require('pull-stream')
const ssbKeys      = require('ssb-keys')
const validate     = require('ssb-validate')
const SecretStack  = require('secret-stack')
const Light        = require('../light/light')
const Relay        = require('../light/relay')

const CAPS = { shs: '1KHLiKZvAvjbY1ziZEHMXawbCEIM6qwjCDm3VYRan/s=' }

function memStore () {
  const m = {}
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v) },
    removeItem: (k) => { delete m[k] }
  }
}

// A minimal but real pub: secret-stack + ssb-ws transport, with classic
// createHistoryStream/add backed by an in-memory validated store.
function startPub (port, cb) {
  let state = validate.initial()
  const feeds = {}                       // feedId -> [ msg value ]

  const replicate = {
    // No `name`: secret-stack then keeps these methods and their permissions at
    // the top level, exactly like the real ssb-db methods a pub exposes.
    manifest: { createHistoryStream: 'source', add: 'async' },
    permissions: { anonymous: { allow: ['manifest', 'createHistoryStream', 'add'] } },
    init () {
      return {
        add (value, cb) {
          try { state = validate.append(state, null, value) }
          catch (e) { return cb(e) } // reject invalid/forged/out-of-order
          ;(feeds[value.author] = feeds[value.author] || []).push(value)
          cb(null, value)
        },
        createHistoryStream (opts) {
          opts = opts || {}
          const from = opts.seq || 1
          const list = (feeds[opts.id] || []).filter((v) => v.sequence >= from)
          return pull.values(list.map((v) =>
            opts.keys === false ? v : { key: validate.id(v), value: v }))
        }
      }
    }
  }

  const createPub = SecretStack({ caps: CAPS }).use(require('ssb-ws')).use(replicate)
  const pub = createPub({
    keys: ssbKeys.generate(),
    host: '127.0.0.1',
    ws: { port },
    connections: {
      incoming: { ws: [{ scope: 'device', transform: 'shs', port, host: '127.0.0.1' }] },
      outgoing: { ws: [{ transform: 'shs' }] }
    }
  })
  pub._feeds = feeds
  cb(null, pub, pub.getAddress('device'))
}

test('light node syncs through a real SSB relay (shs + muxrpc over ws)', (t) => {
  const PORT = 19900 + Math.floor(Math.random() * 500)

  startPub(PORT, (err, pub, addr) => {
    t.error(err, 'pub started')
    t.ok(/^ws:\/\/127\.0\.0\.1:\d+~shs:/.test(addr), 'pub advertises a ws+shs address: ' + addr)

    // --- Node A: our light node, publishes locally, then relays up ---------
    const memStore = () => { const m = {}; return {
      getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: (k) => { delete m[k] } } }

    const A = new Light({ store: memStore(), caps: { sign: null } })
    A.publish({ type: 'post', text: 'hello from the light node' })
    A.publish({ type: 'contact', contact: A.id, following: true })

    // --- Node B: a different identity, whose feed already lives on the pub --
    const B = new Light({ store: memStore(), caps: { sign: null } })
    const b1 = B.publish({ type: 'post', text: 'B says hi' })
    const b2 = B.publish({ type: 'post', text: 'B again' })

    const relayA = new Relay(A, { remote: addr, caps: CAPS })
    const relayB = new Relay(B, { remote: addr, caps: CAPS })

    relayB.connect((err) => {
      t.error(err, 'relay B connected to pub over ws+shs')
      relayB.push((err) => {
        t.error(err, 'B pushed its feed to the pub')
        t.equal((pub._feeds[B.id] || []).length, 2, 'pub now stores B\'s 2 messages')

        relayA.connect((err) => {
          t.error(err, 'relay A connected to pub over ws+shs')

          // A syncs: push its own feed up, and pull B's feed down.
          relayA.sync([B.id], (err) => {
            t.error(err, 'A completed a sync round-trip through the relay')

            t.equal((pub._feeds[A.id] || []).length, 2, 'pub received A\'s 2 messages (push works)')

            const pulled = relayA.get(B.id)
            t.equal(pulled.length, 2, 'A pulled B\'s 2 messages down from the relay (pull works)')
            t.equal(pulled[0].value.content.text, 'B says hi', 'first pulled message content is intact')
            t.equal(pulled[0].key, b1.key, 'pulled message id matches what B signed')
            t.equal(pulled[1].key, b2.key, 'second pulled message id matches')
            t.ok(A.verifyChain(pulled), 'A validates the pulled feed as a signed chain')

            relayA.close(() => relayB.close(() => pub.close(() => t.end())))
          })
        })
      })
    })
  })
})

test('relay: syncFollows replicates the follow graph, durably', (t) => {
  const PORT = 21000 + Math.floor(Math.random() * 400)
  startPub(PORT, (err, pub, addr) => {
    t.error(err, 'pub started')

    const A = new Light({ store: memStore(), caps: { sign: null } })
    const B = new Light({ store: memStore(), caps: { sign: null } })
    const C = new Light({ store: memStore(), caps: { sign: null } })

    B.publish({ type: 'post', text: 'b1' })
    C.publish({ type: 'post', text: 'c1' })
    C.publish({ type: 'post', text: 'c2' })

    // A's own feed declares who it follows — no hand-listing of feed ids.
    A.publish({ type: 'contact', contact: B.id, following: true })
    A.publish({ type: 'contact', contact: C.id, following: true })

    // Put B's and C's feeds on the pub first.
    const rB = new Relay(B, { remote: addr, caps: CAPS })
    const rC = new Relay(C, { remote: addr, caps: CAPS })
    rB.connect(() => rB.push(() => rC.connect(() => rC.push(() => {
      const rA = new Relay(A, { remote: addr, caps: CAPS })
      rA.connect(() => {
        t.deepEqual(rA.following().sort(), [B.id, C.id].sort(),
          'A derives its follow set from its own contact messages')

        rA.syncFollows((err, ids) => {
          t.error(err, 'syncFollows completed')
          t.equal(rA.get(B.id).length, 1, 'auto-pulled B (followed) without naming it')
          t.equal(rA.get(C.id).length, 2, 'auto-pulled C (followed)')
          t.ok(A.verifyChain(rA.get(C.id)), 'pulled C feed validates')

          // Durability: a fresh relay over the SAME store reloads B and C from
          // disk before connecting to anything.
          const rA2 = new Relay(A, { remote: addr, caps: CAPS })
          t.equal(rA2.get(B.id).length, 1, 'new relay reloaded B from storage (no network)')
          t.equal(rA2.get(C.id).length, 2, 'new relay reloaded C from storage')

          rA.close(() => rB.close(() => rC.close(() => pub.close(() => t.end()))))
        })
      })
    }))))
  })
})

test('relay: syncFollows follows friends-of-friends at hops:2', (t) => {
  const PORT = 21500 + Math.floor(Math.random() * 400)
  startPub(PORT, (err, pub, addr) => {
    t.error(err, 'pub started')

    const A = new Light({ store: memStore(), caps: { sign: null } })
    const B = new Light({ store: memStore(), caps: { sign: null } })
    const C = new Light({ store: memStore(), caps: { sign: null } })

    C.publish({ type: 'post', text: 'from C' })
    B.publish({ type: 'post', text: 'from B' })
    B.publish({ type: 'contact', contact: C.id, following: true }) // B follows C
    A.publish({ type: 'contact', contact: B.id, following: true }) // A follows B

    const rB = new Relay(B, { remote: addr, caps: CAPS })
    const rC = new Relay(C, { remote: addr, caps: CAPS })
    rB.connect(() => rB.push(() => rC.connect(() => rC.push(() => {
      const rA = new Relay(A, { remote: addr, caps: CAPS })
      rA.connect(() => {
        rA.syncFollows({ hops: 2 }, (err) => {
          t.error(err, 'syncFollows hops:2 completed')
          t.equal(rA.get(B.id).length, 2, 'pulled B (hop 1)')
          t.equal(rA.get(C.id).length, 1, 'pulled C via B\'s follows (hop 2)')
          rA.close(() => rB.close(() => rC.close(() => pub.close(() => t.end()))))
        })
      })
    }))))
  })
})

test('the relay pub rejects a forged message', (t) => {
  const PORT = 20500 + Math.floor(Math.random() * 500)
  startPub(PORT, (err, pub, addr) => {
    t.error(err, 'pub started')
    const memStore = () => { const m = {}; return {
      getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: (k) => { delete m[k] } } }
    const A = new Light({ store: memStore(), caps: { sign: null } })
    const good = A.publish({ type: 'post', text: 'legit' })

    const relayA = new Relay(A, { remote: addr, caps: CAPS })
    relayA.connect((err) => {
      t.error(err, 'connected')
      const forged = JSON.parse(JSON.stringify(good.value))
      forged.content.text = 'tampered after signing'
      relayA.sbot.add(forged, (err) => {
        t.ok(err, 'pub rejects a message whose content no longer matches its signature')
        relayA.close(() => pub.close(() => t.end()))
      })
    })
  })
})
