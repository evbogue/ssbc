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
    const base  = new URL(remote.split('~')[0])
    const loc   = window.location
    const proto = loc.protocol === 'https:' ? 'wss' : 'ws'
    const host  = loc.hostname + (base.port ? ':' + base.port : '')
    return proto + '://' + host + '~shs:' + key
  } catch (e) {
    return remote
  }
}

module.exports = function () {
  const remote = rewriteRemoteForLocation(loadRemote())
  // Use a same-origin relative URL so blobs are served by the decent-ui HTTP
  // server (which proxies sbot.blobs) rather than the raw sbot WS port.
  const blobsUrl = (typeof window !== 'undefined' && window.location)
    ? window.location.origin + '/blobs/get'
    : 'http://localhost:8888/blobs/get'
  return { remote, blobsUrl }
}
