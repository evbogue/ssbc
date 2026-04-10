'use strict'
// Vendored from ssb-unix-socket@1.0.0
// Adds the unix-socket multiserver transport so local clients can connect
// via ~/.ssb/socket instead of TCP (faster, no auth needed with noauth).
exports.name    = 'unix-socket'
exports.version = '1.0.0'
exports.manifest = {}
exports.init = function (ssk, config) {
  const Unix = require('multiserver/plugins/unix-socket')
  ssk.multiserver.transport({
    name: 'unix',
    create: function (conf) {
      return Unix(Object.assign({}, conf, config))
    }
  })
}
