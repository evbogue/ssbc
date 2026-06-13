'use strict'

// Covers the HTTP write policy: writes (git-receive-pack, /blobs/add) are
// honored only from genuinely-local requests by default ('local'), can be
// opened to all ('open') or refused entirely ('off'). "Local" means a loopback
// peer with no proxy forwarding headers.

const test = require('tape')
const { writesAllowed, requestIsLocal, resolveWritePolicy } = require('../lib/ui-server')
const gitServer = require('../plugins/git-server')

function req(opts) {
  opts = opts || {}
  return {
    method: opts.method || 'GET',
    url: opts.url || '/',
    headers: opts.headers || {},
    socket: { remoteAddress: 'remoteAddress' in opts ? opts.remoteAddress : '127.0.0.1' }
  }
}

test('resolveWritePolicy defaults to local and validates input', (t) => {
  t.equal(resolveWritePolicy(undefined), 'local', 'no config → local')
  t.equal(resolveWritePolicy({}), 'local', 'unset → local')
  t.equal(resolveWritePolicy({ writes: 'bogus' }), 'local', 'invalid → local')
  t.equal(resolveWritePolicy({ writes: 'open' }), 'open')
  t.equal(resolveWritePolicy({ writes: 'off' }), 'off')
  t.end()
})

test('requestIsLocal distinguishes loopback from proxied/remote', (t) => {
  t.ok(requestIsLocal(req({ remoteAddress: '127.0.0.1' })), 'IPv4 loopback is local')
  t.ok(requestIsLocal(req({ remoteAddress: '::1' })), 'IPv6 loopback is local')
  t.ok(requestIsLocal(req({ remoteAddress: '::ffff:127.0.0.1' })), 'IPv4-mapped loopback is local')

  t.notOk(requestIsLocal(req({ remoteAddress: '203.0.113.5' })), 'public address is not local')
  t.notOk(requestIsLocal(req({ remoteAddress: '::ffff:203.0.113.5' })), 'mapped public is not local')

  // Loopback socket but proxied → NOT local (this is the decent.evbogue.com case).
  t.notOk(
    requestIsLocal(req({ remoteAddress: '127.0.0.1', headers: { 'x-forwarded-host': 'decent.evbogue.com' } })),
    'forwarded loopback is not local'
  )
  t.notOk(
    requestIsLocal(req({ remoteAddress: '127.0.0.1', headers: { 'x-forwarded-proto': 'https' } })),
    'x-forwarded-proto also marks non-local'
  )
  t.end()
})

test('writesAllowed honors the three modes', (t) => {
  const local    = req({ remoteAddress: '127.0.0.1' })
  const proxied  = req({ remoteAddress: '127.0.0.1', headers: { 'x-forwarded-host': 'decent.evbogue.com' } })
  const remote   = req({ remoteAddress: '203.0.113.5' })

  // default (local)
  t.ok(writesAllowed({}, local), 'local request allowed by default')
  t.notOk(writesAllowed({}, proxied), 'proxied request denied by default')
  t.notOk(writesAllowed({}, remote), 'remote request denied by default')

  // open
  t.ok(writesAllowed({ writes: 'open' }, proxied), 'open allows proxied')
  t.ok(writesAllowed({ writes: 'open' }, remote), 'open allows remote')

  // off
  t.notOk(writesAllowed({ writes: 'off' }, local), 'off denies even local')
  t.end()
})

// ── Route gating in git-server.handleGitRequest ───────────────────────────────

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    writeHead(code, hdrs) { this.statusCode = code; if (hdrs) Object.assign(this.headers, hdrs) },
    write(chunk) { this.body += chunk },
    end(chunk) { if (chunk) this.body += chunk; this.ended = true }
  }
}

const REPO = '%abc123.sha256'
const enc  = encodeURIComponent(REPO)

test('handleGitRequest refuses receive-pack when writes are not allowed', (t) => {
  // sbot is never reached because the gate fires first.
  const sbot = {}

  // receive-pack advertisement (GET) is gated
  let res = fakeRes()
  let handled = gitServer.handleGitRequest(
    sbot,
    { method: 'GET', url: '/git/' + enc + '/info/refs?service=git-receive-pack', headers: {} },
    res,
    false
  )
  t.ok(handled, 'advertisement request handled')
  t.equal(res.statusCode, 403, 'receive-pack advert is 403 when canWrite=false')

  // receive-pack pack POST is gated
  res = fakeRes()
  gitServer.handleGitRequest(
    sbot,
    { method: 'POST', url: '/git/' + enc + '/git-receive-pack', headers: {} },
    res,
    false
  )
  t.equal(res.statusCode, 403, 'receive-pack POST is 403 when canWrite=false')

  // omitting canWrite defaults to deny (secure default)
  res = fakeRes()
  gitServer.handleGitRequest(
    sbot,
    { method: 'POST', url: '/git/' + enc + '/git-receive-pack', headers: {} },
    res
  )
  t.equal(res.statusCode, 403, 'missing canWrite arg denies the write')
  t.end()
})

test('handleGitRequest never returns 403 for read routes regardless of canWrite', (t) => {
  // upload-pack (clone/fetch) advertisement must not be gated. We can't fully
  // run it without a real sbot, but the write gate must not be what fires: it
  // should fall through to the repo lookup (which 404s on our fake sbot).
  const sbot = { get: (id, cb) => cb(new Error('no repo')) }
  const res = fakeRes()
  gitServer.handleGitRequest(
    sbot,
    { method: 'GET', url: '/git/' + enc + '/info/refs?service=git-upload-pack', headers: {} },
    res,
    false // even with writes denied, a read must proceed past the gate
  )
  t.notEqual(res.statusCode, 403, 'upload-pack advert is not blocked by the write gate')
  t.end()
})
