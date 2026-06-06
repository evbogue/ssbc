'use strict'

const fs   = require('fs')
const path = require('path')
const test = require('tape')

const registry  = require('../lib/builtin-plugins')
const generator = require('../scripts/gen-api-reference')

test('committed docs/api-reference.md matches a fresh render', (t) => {
  const committed = fs.readFileSync(generator.OUTPUT_PATH, 'utf8')
  const rendered  = generator.renderApiReference()
  t.equal(rendered, committed,
    'docs/api-reference.md is up to date — run `npm run gen:api-reference` if this fails')
  t.end()
})

test('every RPC-bearing built-in manifest method appears in the reference', (t) => {
  const reference = generator.renderApiReference()
  for (const entry of registry.referenceEntries()) {
    const manifest = entry.module && entry.module.manifest
    if (!manifest || Object.keys(manifest).length === 0) continue
    for (const method of Object.keys(manifest)) {
      const qualified = entry.namespace ? entry.namespace + '.' + method : method
      t.ok(reference.includes('`' + qualified + '`'),
        qualified + ' is listed in the API reference')
    }
  }
  t.end()
})

test('stub modules and git.create are present and marked', (t) => {
  const reference = generator.renderApiReference()

  // git.create is a single-method plugin that is easy to drop accidentally.
  t.ok(reference.includes('`git.create`'), 'git.create is documented')

  // Stub modules must be visible and flagged as stubs.
  const stubs = registry.referenceEntries().filter((e) => e.kind === 'stub')
  t.ok(stubs.length >= 2, 'registry still has the replicate and ooo stubs')
  for (const stub of stubs) {
    t.ok(reference.includes('`' + stub.namespace + '` — stub'),
      stub.namespace + ' is marked as a stub section')
  }
  t.ok(reference.includes('**Stub / no-op in this build.**'),
    'stub methods carry a stub marker')
  t.end()
})

test('bin.js mounts through the shared registry, not a second list', (t) => {
  const binSource = fs.readFileSync(path.join(__dirname, '..', 'bin.js'), 'utf8')

  t.ok(binSource.includes("builtin-plugins').applyTo("),
    'bin.js builds the server via builtin-plugins.applyTo')

  // Guard against a second, hand-maintained .use(...) chain creeping back into
  // bin.js. The only require('...').use pattern allowed is loadUserPlugins.
  const useChain = binSource.match(/\.use\(require\(/g) || []
  t.equal(useChain.length, 0,
    'bin.js contains no inline .use(require(...)) plugin chain')
  t.end()
})
