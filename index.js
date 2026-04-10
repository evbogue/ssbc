'use strict'

const SecretStack = require('secret-stack')

// SSB capability keys (previously from the ssb-caps npm package).
// These are the canonical keys for the SSB network.
const caps = {
  shs:  Buffer.from('1KHLiKZvAvjbY1ziZEHMXawbCEIM6qwjCDm3VYRan/s=', 'base64'),
  sign: Buffer.from('g3hPVPsvangkUmIoNFJsKGNfBFiaTBmNxpJyNVqKMnA=', 'base64')
}

// Create an sbot with default caps. These can be overridden when you call create.
function createSsbServer() {
  return SecretStack({
    caps,
    permissions: {
      anonymous: {
        // allow Decent / browser clients over ssb-ws + noauth
        allow: [
          'whoami',
          'createLogStream',
          'createUserStream',
          'createHistoryStream',
          'createFeedStream',
          'createSequenceStream',
          'messagesByType',
          'get',
          'getLatest',
          'latest',
          'latestSequence',
          'add',
          'del',
          'links',
          'links2.read',
          'status',
          'progress',
          'version',
          'help',
          'query.read'
        ]
      }
    }
  }).use(require('./lib/db'))
}

module.exports = createSsbServer()
module.exports.createSsbServer = createSsbServer
