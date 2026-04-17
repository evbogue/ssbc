'use strict'

module.exports = function () {
  const remote = (typeof window !== 'undefined' && window.PATCHBAY_REMOTE)
    ? window.PATCHBAY_REMOTE
    : null
  // Use a same-origin relative URL so blobs are served by the decent-ui HTTP
  // server (which proxies sbot.blobs) rather than the raw sbot WS port.
  const blobsUrl = (typeof window !== 'undefined' && window.location)
    ? window.location.origin + '/blobs/get'
    : 'http://localhost:8888/blobs/get'
  return { remote, blobsUrl }
}
