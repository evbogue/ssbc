var config = require('../config')

module.exports = {
  gives: 'blob_url',
  create: function () {
    return function (link) {
      // unwrap common { link: '&...' } shapes, possibly nested
      while (link && typeof link === 'object' && typeof link.link !== 'undefined') {
        link = link.link
      }

      return config().blobsUrl + '/' + String(link)
    }
  }
}
