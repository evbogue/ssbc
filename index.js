var SecretStack = require('secret-stack')
var caps = require('ssb-caps')

// create a sbot with default caps. these can be overridden again when you call create.
function createSsbServer () {
  return SecretStack({
    caps: caps,
    permissions: {
      anonymous: {
        // allow Patchbay / browser clients over ssb-ws + noauth
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
  })
    .use(require('ssb-db'))
}
module.exports = createSsbServer()

// this isn't really needed anymore.
module.exports.createSsbServer = createSsbServer
