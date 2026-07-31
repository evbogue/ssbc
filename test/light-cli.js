'use strict'

// Exercises the headless CLI as a real child process: identity, publishing,
// private messages (encrypted on disk, readable by us), the follow graph, and a
// real sync to a secret-stack pub over ws — all with no browser and no server.

const test         = require('tape')
const fs           = require('fs')
const os           = require('os')
const path         = require('path')
const { execFileSync, execFile } = require('child_process')
const pull         = require('pull-stream')
const ssbKeys      = require('ssb-keys')
const validate     = require('ssb-validate')
const SecretStack  = require('secret-stack')

const CLI  = path.join(__dirname, '..', 'light', 'cli.js')
const CAPS = { shs: '1KHLiKZvAvjbY1ziZEHMXawbCEIM6qwjCDm3VYRan/s=' }

function tmp () { return fs.mkdtempSync(path.join(os.tmpdir(), 'ssb-light-cli-')) }
function run (dir, args) {
  return execFileSync('node', [CLI].concat(args), {
    env: Object.assign({}, process.env, { SSB_LIGHT_PATH: dir }),
    encoding: 'utf8'
  }).trim()
}

test('cli: identity, publish, private, log', (t) => {
  const dir = tmp()

  const id = run(dir, ['whoami'])
  t.ok(/^@[A-Za-z0-9/+]+=\.ed25519$/.test(id), 'whoami prints an ed25519 id')
  t.equal(run(dir, ['whoami']), id, 'identity is stable across invocations (persisted)')

  const key = run(dir, ['publish', 'hello from the cli'])
  t.ok(/^%[A-Za-z0-9/+]+=\.sha256$/.test(key), 'publish prints a message id')

  const pkey = run(dir, ['private', id, 'a secret to myself'])
  t.ok(/^%.+\.sha256$/.test(pkey), 'private prints a message id')

  const log = run(dir, ['log'])
  t.ok(/hello from the cli/.test(log), 'log shows the public post')
  t.ok(/a secret to myself/.test(log), 'log shows our own private post decrypted (we are a recipient)')

  // On disk the private body is ciphertext, not plaintext.
  const raw = fs.readFileSync(path.join(dir, 'store.json'), 'utf8')
  t.ok(raw.indexOf('.box') !== -1, 'private message is stored as .box ciphertext')
  t.ok(raw.indexOf('a secret to myself') === -1, 'plaintext of the private message is NOT on disk')

  t.end()
})

test('cli: follow graph', (t) => {
  const dir = tmp()
  const friend = ssbKeys.generate().id
  run(dir, ['follow-add', friend])
  t.equal(run(dir, ['following']), friend, 'following lists a followed feed')
  run(dir, ['follow-rm', friend])
  t.equal(run(dir, ['following']), '', 'following is empty after unfollow')
  t.end()
})

test('cli: sync to a real pub over ws', (t) => {
  const PORT = 22600 + Math.floor(Math.random() * 300)
  let state = validate.initial()
  const feeds = {}
  const replicate = {
    manifest: { createHistoryStream: 'source', add: 'async' },
    permissions: { anonymous: { allow: ['manifest', 'createHistoryStream', 'add'] } },
    init () {
      return {
        add (v, cb) { try { state = validate.append(state, null, v) } catch (e) { return cb(e) } ;(feeds[v.author] = feeds[v.author] || []).push(v); cb(null, v) },
        createHistoryStream (o) { o = o || {}; const f = o.seq || 1; return pull.values((feeds[o.id] || []).filter(v => v.sequence >= f).map(v => o.keys === false ? v : { key: validate.id(v), value: v })) }
      }
    }
  }
  const pub = SecretStack({ caps: CAPS }).use(require('ssb-ws')).use(replicate)({
    keys: ssbKeys.generate(), host: '127.0.0.1', ws: { port: PORT },
    connections: { incoming: { ws: [{ scope: 'device', transform: 'shs', port: PORT, host: '127.0.0.1' }] }, outgoing: { ws: [{ transform: 'shs' }] } }
  })
  const addr = pub.getAddress('device')

  const dir = tmp()
  const id = run(dir, ['whoami'])
  run(dir, ['publish', 'published locally, then synced'])

  // Must be async: the pub runs in this same process, so a *blocking* child
  // call would freeze the event loop and starve the handshake.
  execFile('node', [CLI, 'sync', addr], {
    env: Object.assign({}, process.env, { SSB_LIGHT_PATH: dir }), encoding: 'utf8'
  }, (err) => {
    t.error(err, 'sync command exited cleanly')
    t.equal((feeds[id] || []).length, 1, 'the pub received the cli feed over ws')
    pub.close(() => t.end())
  })
})
