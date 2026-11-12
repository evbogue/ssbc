'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')
const pull = require('pull-stream')
const keys = require('ssb-keys')
const validate = require('ssb-validate')
const test = require('tape')
const SecretStack = require('secret-stack')

const caps = { shs: crypto.randomBytes(32), sign: crypto.randomBytes(32) }
const create = SecretStack({ caps }).use(require('../lib/db')).use(require('../plugins/recent-sync'))
const collect = promisify((source, cb) => pull(source, pull.collect(cb)))
const call = (fn, ...args) => promisify(fn)(...args)
const seqs = entries => entries.map(entry => entry.value.sequence)

async function publish(node, text) {
  const latest = await call(node.getLatest, node.id)
  const prev = latest && { id: latest.key, sequence: latest.value.sequence, timestamp: latest.value.timestamp, queue: [] }
  const value = validate.create(prev, node.config.keys, caps.sign, { type: 'post', text }, prev ? prev.timestamp + 1 : 1)
  return call(node.add, value)
}

function peer(dir, keypair) {
  return create({ path: dir, keys: keypair, caps, host: '127.0.0.1', port: 0 })
}

function run(t, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssbc-recent-'))
  const nodes = new Set()
  function start(name, identity = keys.generate()) {
    const location = path.join(dir, name)
    const node = peer(location, identity)
    nodes.add(node)
    return node
  }
  async function close(node) {
    await call(node.close, true)
    nodes.delete(node)
  }
  Promise.resolve().then(() => body(start, close)).catch(err => t.fail(err.stack)).finally(async () => {
    await Promise.all([...nodes].map(close))
    fs.rmSync(dir, { recursive: true, force: true })
    t.end()
  })
}

test('recent sync pulls a bounded signed suffix over muxrpc and resumes after restart', t => run(t, async (start, close) => {
  const author = keys.generate()
  let alice = start('alice', author)
  const identity = keys.generate()
  let bob = start('bob', identity)
  for (let i = 1; i <= 7; i++) await publish(alice, String(i))
  let remote = alice.getAddress()
  const id = alice.id
  const step = () => call(bob.recentSync.pull, { remote, id, limit: 2 })
  const recent = () => collect(bob.recentSync.read({ id }))
  t.deepEqual(await step(), { sequence: 0, newest: 7, before: 6, complete: false, received: 2, promoted: 0 })
  t.deepEqual(seqs(await recent()), [7, 6], 'recent messages are readable after two transfers')
  t.equal((await call(bob.getVectorClock))[id], undefined, 'EBT does not advertise the suffix')
  t.deepEqual(await collect(bob.recentSync.history({ id })), [], 'staged messages are not served to peers')

  await close(bob)
  bob = start('bob', identity)
  t.deepEqual(seqs(await recent()), [7, 6], 'suffix survived restart')
  t.equal((await step()).before, 4)
  t.equal((await step()).before, 2)
  t.deepEqual(await step(), { sequence: 2, newest: 7, before: null, complete: false, received: 1, promoted: 2 })
  await close(alice)
  t.equal((await step()).sequence, 4, 'promotion proceeds while the peer is offline')
  t.equal((await step()).sequence, 6)
  t.deepEqual(await step(), { sequence: 7, newest: 7, before: null, complete: true, received: 0, promoted: 1 })
  t.deepEqual(seqs(await collect(bob.createHistoryStream({ id }))), [1, 2, 3, 4, 5, 6, 7])
  t.equal((await call(bob.getVectorClock))[id], 7)

  alice = start('alice', author)
  remote = alice.getAddress()
  await publish(alice, '8')
  t.deepEqual(await step(), { sequence: 8, newest: 8, before: null, complete: true, received: 1, promoted: 1 })
  t.deepEqual(seqs(await collect(bob.recentSync.read({ id, before: 7, limit: 2 }))), [6, 5])
}))

test('reverse pages reject forged signatures, forks, and gaps atomically', t => run(t, async start => {
  const alice = start('alice')
  const bob = start('bob')
  const id = alice.id
  const store = bob.db.recent
  const entries = []
  for (let i = 1; i <= 4; i++) entries.push(await publish(alice, String(i)))
  const [first, second, third, fourth] = entries
  const forged = { ...third.value, content: { type: 'post', text: 'forged' } }
  t.throws(() => store.commit(id, null, [fourth, { key: validate.id(forged), value: forged }], 2), /signature/)
  t.throws(() => store.commit(id, null, [fourth, second], 2), /hash or sequence/)
  t.throws(() => store.commit(id, null, [{ ...fourth, key: third.key }], 2), /hash or sequence/)
  t.deepEqual(store.read(id, 10, 10), [], 'failed pages leave no staged messages')

  const alternate = start('alternate', alice.config.keys)
  await call(alternate.add, first.value)
  const fork = await publish(alternate, 'fork')
  await call(bob.add, first.value)
  store.commit(id, null, [fourth, third], 2)
  t.throws(() => store.commit(id, 3, [fork], 2), /hash or sequence/)
  t.throws(() => store.commit(id, 3, [], 2), /missing/)
  t.equal(store.status(id).before, 3, 'failed pages leave the cursor in place')
  t.equal(store.commit(id, 3, [second], 2).sequence, 3, 'staged suffix joins the canonical prefix')
  t.equal(store.commit(id, null, [], 2).complete, true)
  t.deepEqual(seqs(store.read(id, 10, 10)), [4, 3, 2, 1])
}))
