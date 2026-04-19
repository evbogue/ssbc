'use strict'

const dgram = require('dgram')
const os = require('os')
const ref = require('../../plugins/ref')

function collectInterfaceAddresses() {
  const addresses = {}
  const interfaces = os.networkInterfaces()

  Object.keys(interfaces).forEach((name) => {
    interfaces[name].forEach((address) => {
      addresses[address.address] = true
    })
  })

  return addresses
}

function isLoopbackPeer(peer, listenPort, localAddresses) {
  return !!(localAddresses[peer.address] && peer.port === listenPort)
}

function parsePeerAddress(data) {
  if (typeof data !== 'string') return null
  const peer = ref.parseAddress(data)
  return ref.isAddress(peer) ? peer : null
}

module.exports = {
  name: 'local',
  version: '2.0.0',
  init: function init(ssbServer, config) {
    if (config.gossip && config.gossip.local === false) {
      return {
        init: function () {
          delete this.init
          init(ssbServer, config)
        }
      }
    }

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const addrs = {}
    const lastSeen = {}
    let localAddresses = {}

    socket.on('listening', () => {
      localAddresses = collectInterfaceAddresses()
      socket.setBroadcast(true)
    })

    socket.on('message', (msg, peer) => {
      if (isLoopbackPeer(peer, config.port, localAddresses)) return

      const data = msg.toString()
      const parsed = parsePeerAddress(data)
      if (!parsed || parsed.key === ssbServer.id) return

      addrs[parsed.key] = parsed
      lastSeen[parsed.key] = Date.now()
      ssbServer.gossip.add(data, 'local')
    })

    socket.on('error', (err) => {
      if (typeof ssbServer.emit === 'function') {
        ssbServer.emit('log:warn', ['local', 'udp-error', err.message])
      }
    })

    socket.bind(config.port)

    const cleanupTimer = setInterval(() => {
      Object.keys(lastSeen).forEach((key) => {
        if (Date.now() - lastSeen[key] > 10e3) {
          ssbServer.gossip.remove(addrs[key])
          delete addrs[key]
          delete lastSeen[key]
        }
      })
    }, 5e3)

    if (cleanupTimer.unref) cleanupTimer.unref()

    ssbServer.status.hook((fn) => {
      const status = fn()

      if (Object.keys(addrs).length) {
        status.local = {}
        Object.keys(addrs).forEach((key) => {
          status.local[key] = { address: addrs[key], seen: lastSeen[key] }
        })
      }

      return status
    })

    setImmediate(() => {
      const broadcastTimer = setInterval(() => {
        if (config.gossip && config.gossip.local === false) return

        const addr = ssbServer.getAddress('private') || ssbServer.getAddress('local')
        if (!addr) return

        socket.send(Buffer.from(addr, 'utf8'), config.port, '255.255.255.255')
      }, 1000)

      if (broadcastTimer.unref) broadcastTimer.unref()
    })
  }
}

module.exports._collectInterfaceAddresses = collectInterfaceAddresses
module.exports._isLoopbackPeer = isLoopbackPeer
module.exports._parsePeerAddress = parsePeerAddress
