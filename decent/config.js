
var URL = require('url')

function loadRemote () {
  var remote = null

  if (typeof window !== 'undefined' && window.PATCHBAY_REMOTE) {
    remote = window.PATCHBAY_REMOTE
  }

  return remote
}

function rewriteRemoteForLocation (remote) {
  if (!remote || typeof window === 'undefined' || !window.location) return remote

  try {
    var shsIndex = remote.indexOf('~shs:')
    if (shsIndex === -1) return remote

    var base = remote.substring(0, shsIndex)
    var parsed = URL.parse(base)
    var key = remote.substring(shsIndex + 5)
    var loc = window.location
    var isLocal = parsed && (parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')

    if (!isLocal) return remote

    var proto = loc.protocol === 'https:' ? 'wss' : 'ws'
    var hostname = loc.hostname || loc.host
    if (hostname && hostname.indexOf(':') !== -1 && hostname[0] !== '[')
      hostname = '[' + hostname + ']'
    var port = parsed && parsed.port ? parsed.port : loc.port
    var host = hostname + (port ? ':' + port : '')

    return proto + '://' + host + '~shs:' + key
  } catch (e) {
    return remote
  }
}

module.exports = function () {
  var remote = loadRemote()

  // In the browser, rewrite localhost remotes to match the page host,
  // while preserving the pubkey and port from the original remote.
  remote = rewriteRemoteForLocation(remote)

  //TODO: use _several_ remotes, so if one goes down,
  //      you can still communicate via another...
  //      also, if a blob does not load, use another pub...

  //if we are the light client, get our blobs from the same domain.
  var blobsUrl
  if (remote) {
    var r = URL.parse(remote.split('~')[0])
    //this will work for ws and wss.
    r.protocol = r.protocol.replace('ws', 'http')
    r.pathname = '/blobs/get'
    blobsUrl = URL.format(r)
  }
  else
    blobsUrl = 'http://localhost:8989/blobs/get'

  return {
    remote: remote,
    blobsUrl: blobsUrl
  }
}
