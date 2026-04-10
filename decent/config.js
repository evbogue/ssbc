'use strict'

function loadRemote () {
  if (typeof window !== 'undefined' && window.PATCHBAY_REMOTE)
    return window.PATCHBAY_REMOTE
  return null
}

function rewriteRemoteForLocation (remote) {
  if (!remote || typeof window === 'undefined' || !window.location) return remote
  try {
    const shsIndex = remote.indexOf('~shs:')
    if (shsIndex === -1) return remote
    const key   = remote.substring(shsIndex + 5)
    const loc   = window.location
    const proto = loc.protocol === 'https:' ? 'wss' : 'ws'
    const host  = loc.host || (loc.hostname + (loc.port ? ':' + loc.port : ''))
    return proto + '://' + host + '~shs:' + key
  } catch (e) {
    return remote
  }
}

module.exports = function () {
  const remote = rewriteRemoteForLocation(loadRemote())
  let blobsUrl
  if (remote) {
    try {
      const url = new URL(remote.split('~')[0].replace(/^ws/, 'http'))
      url.pathname = '/blobs/get'
      blobsUrl = url.toString()
    } catch (_) {
      blobsUrl = 'http://localhost:8989/blobs/get'
    }
  } else {
    blobsUrl = 'http://localhost:8989/blobs/get'
  }
  return { remote, blobsUrl }
}
