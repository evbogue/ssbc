'use strict'
// Vendored from ssb-master@1.0.3 — zero external deps
// Grants "master" IDs (from config.master) the same rights as the local key.
module.exports = function (api, opts) {
  const masters = [api.id].concat(opts.master).filter(Boolean)
  api.auth.hook(function (fn, args) {
    const id = args[0]
    const cb = args[1]
    cb(null, ~masters.indexOf(id) ? { allow: null, deny: null } : null)
  })
}
