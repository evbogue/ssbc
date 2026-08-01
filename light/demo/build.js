'use strict'

// Build the standalone light-node demo into a single self-contained index.html.
//
//   node light/demo/build.js
//
// Two browser-specific fixes are applied (see light/README.md):
//   * alias `chloride` -> pure-JS `sodium-browserify-tweetnacl` (no wasm/native)
//   * stub `multiserver/plugins/unix-socket` (Node-only, unused when dialing ws)
//
// Requires the repo's dev/runtime deps to be installed (browserify + the ssb-*
// stack, all already in package.json).

const fs   = require('fs')
const path = require('path')
const browserify = require('browserify')

const OUT = path.join(__dirname, 'index.html')

// A browser-safe replacement for multiserver's unix-socket transport.
const unixStub = path.join(__dirname, '.unix-stub.js')
fs.writeFileSync(unixStub,
  'module.exports = function Unix (o) { o = o || {}; return {' +
  ' name: "unix", scope: function () { return o.scope || "device" },' +
  ' server: function () { return function () {} },' +
  ' client: function (a, cb) { cb(new Error("unix unavailable in browser")) },' +
  ' stringify: function () { return null }, parse: function () { return null } } }\n')

const b = browserify(path.join(__dirname, 'demo.js'), {
  // insert a `process.env.CHLORIDE_JS = '1'` shim so ssb-keys takes the JS path
  insertGlobalVars: {
    process: () => '{ env: { CHLORIDE_JS: "1" }, browser: true, nextTick: function (f) { setTimeout(f, 0) } }'
  }
})
b.require('sodium-browserify-tweetnacl', { expose: 'chloride' })
b.require(unixStub, { expose: 'multiserver/plugins/unix-socket' })

b.bundle((err, buf) => {
  fs.unlinkSync(unixStub)
  if (err) { console.error(String(err)); process.exit(1) }
  const html =
    '<!doctype html>\n<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>SSB light node</title></head><body>\n' +
    '<script>\n' + buf.toString('utf8') + '\n</script>\n' +
    '</body></html>\n'
  fs.writeFileSync(OUT, html)
  console.log('wrote', OUT, '(' + html.length + ' bytes)')
})
