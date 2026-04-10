'use strict'
// Vendored from ssb-no-auth@1.0.0
// Adds the 'noauth' multiserver transform so clients on the unix socket
// don't need to perform SHS handshake (they're already trusted by the OS).
exports.name    = 'no-auth'
exports.version = '1.0.0'
exports.manifest = {}
exports.init = function (ssk, config) {
  const Noauth = require('multiserver/plugins/noauth')
  ssk.multiserver.transform({
    name: 'noauth',
    create: function () {
      return Noauth({
        keys: {
          publicKey: Buffer.from(config.keys.public, 'base64')
        }
      })
    }
  })
}
