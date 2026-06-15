'use strict'

// Single ordered registry of the server's built-in plugins.
//
// Both server startup (`bin.js`) and the API-reference generator
// (`scripts/gen-api-reference.js`) consume this list, so the running server and
// the generated `docs/api-reference.md` can never drift apart. The mount order
// here is significant and must match the historical `.use(...)` order.
//
// `kind` classifies each entry for the reference:
//   'rpc'   - contributes a static RPC manifest to the documented surface
//   'infra' - zero-manifest infrastructure, transport, or UI module
//   'stub'  - stub / compatibility shim (may still expose a small manifest)
//
// Require paths are resolved relative to this file (`lib/`).

// The root database is mounted by `index.js` (the secret-stack factory), not in
// the plugin chain below, but it is the primary RPC surface so it is described
// here for the reference. `namespace` is null because its methods are unprefixed
// (e.g. `publish`, `whoami`) rather than namespaced (e.g. `gossip.add`).
const ROOT_DB = {
  name: 'lib/db',
  path: './db',
  kind: 'rpc',
  namespace: null,
  module: require('./db')
}

const BUILTIN_PLUGINS = [
  { name: 'ssb-private1',       path: 'ssb-private1',                    kind: 'infra' },
  { name: 'ssb-unix-socket',    path: './vendor/ssb-unix-socket',        kind: 'infra' },
  { name: 'ssb-no-auth',        path: './vendor/ssb-no-auth',            kind: 'infra' },
  { name: 'ssb-plugins',        path: 'ssb-plugins',                     kind: 'rpc'   },
  { name: 'ssb-master',         path: './vendor/ssb-master',             kind: 'infra' },
  { name: 'ssb-gossip',         path: 'ssb-gossip',                      kind: 'rpc'   },
  { name: 'ssb-replicate-stub', path: './vendor/ssb-replicate-stub',     kind: 'stub'  },
  { name: 'ssb-ebt',            path: 'ssb-ebt',                         kind: 'rpc'   },
  { name: 'friends',            path: '../plugins/friends',              kind: 'rpc'   },
  { name: 'ssb-blobs',          path: 'ssb-blobs',                       kind: 'rpc'   },
  { name: 'invite',             path: '../plugins/invite',               kind: 'rpc'   },
  { name: 'git-server',         path: '../plugins/git-server',           kind: 'rpc'   },
  { name: 'decent-ui',          path: '../plugins/decent-ui',            kind: 'infra' },
  { name: 'ssbski-ui',          path: '../plugins/ssbski-ui',            kind: 'infra' },
  { name: 'ssb-local',          path: './vendor/ssb-local',              kind: 'infra' },
  { name: 'ssb-logging',        path: './vendor/ssb-logging',            kind: 'infra' },
  { name: 'ssb-query',          path: 'ssb-query',                       kind: 'stub'  },
  { name: 'ssb-links',          path: 'ssb-links',                       kind: 'rpc'   },
  { name: 'ssb-ws',             path: 'ssb-ws',                          kind: 'infra' },
  { name: 'ssb-ooo-stub',       path: './vendor/ssb-ooo-stub',           kind: 'stub'  }
]

// Eagerly require each plugin so the registry doubles as the authoritative
// module list. Requiring a secret-stack plugin only loads its definition; it
// does not start any servers or open ports.
for (const entry of BUILTIN_PLUGINS) {
  entry.module = require(entry.path)
  if (!('namespace' in entry)) entry.namespace = entry.module && entry.module.name || null
}

// Mount every built-in plugin onto a secret-stack instance, in order.
// `stack` is the value of `require('../')` (index.js), which has already mounted
// the root database.
function applyTo(stack) {
  return BUILTIN_PLUGINS.reduce((s, entry) => s.use(entry.module), stack)
}

// The ordered list used to build the API reference: the root database first,
// then every built-in plugin in mount order.
function referenceEntries() {
  return [ROOT_DB].concat(BUILTIN_PLUGINS)
}

module.exports = {
  ROOT_DB,
  BUILTIN_PLUGINS,
  applyTo,
  referenceEntries
}
