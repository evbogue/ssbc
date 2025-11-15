
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

module.exports = function () {
  var remote = loadRemote()

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

