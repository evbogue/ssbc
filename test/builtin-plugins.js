'use strict'

const os      = require('os')
const fs      = require('fs')
const path    = require('path')
const test    = require('tape')
const ssbKeys = require('ssb-keys')

const registry = require('../lib/builtin-plugins')

// The expected mount order of the built-in plugin chain (everything bin.js adds
// on top of the root database from index.js). If bin.js and the registry ever
// disagree, this list is the canonical one.
const EXPECTED_ORDER = [
  'ssb-private1',
  'ssb-unix-socket',
  'ssb-no-auth',
  'ssb-plugins',
  'ssb-master',
  'ssb-gossip',
  'ssb-replicate-stub',
  'ssb-ebt',
  'friends',
  'ssb-blobs',
  'invite',
  'git-server',
  'decent-ui',
  'ssbski-ui',
  'ssbpro-ui',
  'ssb-local',
  'ssb-logging',
  'ssb-query',
  'ssb-links',
  'ssb-ws',
  'ssb-ooo-stub'
]

test('built-in registry preserves the historical mount order', (t) => {
  t.deepEqual(
    registry.BUILTIN_PLUGINS.map((e) => e.name),
    EXPECTED_ORDER,
    'plugin names match the documented mount order'
  )
  t.end()
})

test('applyTo mounts every built-in plugin in order', (t) => {
  const mounted = []
  const fakeStack = { use(plugin) { mounted.push(plugin); return this } }
  const out = registry.applyTo(fakeStack)
  t.equal(out, fakeStack, 'applyTo returns the stack for chaining')
  t.deepEqual(
    mounted,
    registry.BUILTIN_PLUGINS.map((e) => e.module),
    'each registry module is .use()d exactly once, in order'
  )
  t.end()
})

test('static manifests cover the 83-method built-in baseline', (t) => {
  let total = 0
  for (const entry of registry.referenceEntries()) {
    const manifest = entry.module && entry.module.manifest
    if (entry.kind === 'rpc' || entry.kind === 'stub') {
      t.ok(manifest && Object.keys(manifest).length > 0,
        entry.name + ' exposes a static manifest')
      total += Object.keys(manifest).length
    }
  }
  t.equal(total, 83, 'derived static method count matches the audited baseline')
  t.end()
})

test('a server built from the registry still produces the expected manifest', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ssb-registry-smoke-'))
  const config = {
    path: home,
    keys: ssbKeys.generate(),
    port: 0,
    host: '127.0.0.1',
    ws: false,
    master: [],
    // Keep the smoke test from binding real ports or broadcasting on the LAN.
    decent: { port: false },
    ssbski: { port: false },
    ssbpro: { port: false },
    gossip: { local: false }
  }

  const createSsbServer = registry.applyTo(require('../'))
  const server = createSsbServer(config)
  const live = server.getManifest()

  // Every static-manifest method from the registry must appear in the live
  // server manifest under its namespace (or at the root for lib/db).
  for (const entry of registry.referenceEntries()) {
    const manifest = entry.module && entry.module.manifest
    if (!manifest || Object.keys(manifest).length === 0) continue
    const ns = entry.namespace
    const target = ns ? live[ns] : live
    t.ok(target && typeof target === 'object',
      (ns || 'root') + ' namespace is present in the live manifest')
    for (const method of Object.keys(manifest)) {
      t.ok(target && method in target,
        (ns ? ns + '.' : '') + method + ' is present in the live manifest')
    }
  }

  server.close(true, () => {
    fs.rmSync(home, { recursive: true, force: true })
    t.end()
  })
})
