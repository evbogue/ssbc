'use strict'

module.exports = {
  name: 'ooo',
  version: '1.0.0',
  manifest: {
    stream: 'duplex',
    get: 'async',
    help: 'sync'
  },
  permissions: {
    anonymous: { allow: ['stream'] }
  },
  init: function () {
    return {
      stream: function () {
        throw new Error('ooo is unavailable in SQLite mode')
      },
      get: function (opts, cb) {
        cb(new Error('ooo is unavailable in SQLite mode'))
      },
      help: function () {
        return require('ssb-ooo/help')
      }
    }
  }
}
