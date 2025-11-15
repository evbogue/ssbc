var ref = require('ssb-ref')

exports.name = 'blobs-size-fix'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  if (!sbot.blobs || typeof sbot.blobs.size !== 'function') return {}

  var originalSize = sbot.blobs.size

  sbot.blobs.size = function (id, cb) {
    // Preserve legacy call style blobs.size(cb)
    if (typeof id === 'function' && cb == null) {
      return originalSize.call(this, id)
    }

    // Normal style: blobs.size(id, cb) with a single blob id
    if (!ref.isBlob(id)) {
      return cb(new Error('invalid id:' + id))
    }

    sbot.blobs.meta(id, function (err, meta) {
      if (err) return cb(err)
      cb(null, meta ? meta.size : null)
    })
  }

  return {}
}

