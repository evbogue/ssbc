var SecretStack = require('secret-stack')
var caps = require('ssb-caps')
var AsyncSingle = require('async-single')

// patch async-single to avoid NaN timeouts on first use
if (!AsyncSingle.prototype._timeoutPatched) {
  var originalTimeout = AsyncSingle.prototype._timeout
  AsyncSingle.prototype._timeoutPatched = true
  AsyncSingle.prototype._timeout = function (delay) {
    if (delay == null && this._ts == null)
      this._ts = Date.now()
    return originalTimeout.call(this, delay)
  }
}

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
