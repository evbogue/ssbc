var config = require('../config')

module.exports = {
  gives: 'blobs_url',
  create: function () {
    return function () {
      return config().blobsUrl
    }
  }
}

