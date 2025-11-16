
var URL = require('url')

function loadRemote () {
  var remote = null

  if (typeof window !== 'undefined' && window.PATCHBAY_REMOTE) {
    remote = window.PATCHBAY_REMOTE

    if (typeof localStorage !== 'undefined') {
      try { localStorage.remote = remote } catch (e) {}
    }
  } else if (typeof localStorage !== 'undefined') {
    try {
      remote = localStorage.remote || null
    } catch (e) {
      remote = null
    }
  }

  return remote
}

function rewriteRemoteForLocation (remote) {
  if (!remote || typeof window === 'undefined' || !window.location) return remote

  try {
    var parts = remote.split('~')
    var base = parts[0]
    var suffix = parts.length > 1 ? '~' + parts.slice(1).join('~') : ''

    var u = URL.parse(base)

    if (!u || !u.protocol || !/^wss?:$/.test(u.protocol)) return remote

    // Only rewrite when the remote thinks it's localhost
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return remote

    var loc = window.location

    // Use the page's hostname, keep the original port
    u.protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:'
    u.hostname = loc.hostname
    if (!u.port) {
      u.port = loc.port || (loc.protocol === 'https:' ? '443' : '80')
    }

    var formatted = URL.format(u)
    if (formatted.charAt(formatted.length - 1) === '/')
      formatted = formatted.slice(0, -1)

    return formatted + suffix
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
