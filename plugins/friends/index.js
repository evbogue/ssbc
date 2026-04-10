'use strict'

const LayeredGraph = require('layered-graph')
const pull         = require('pull-stream')
const isFeed       = require('../ref').isFeed

// friends plugin
// methods to analyze the social graph
// maintains a 'follow' and 'flag' graph

exports.name = 'friends'
exports.version = '1.0.0'
exports.manifest = {
  hopStream: 'source',
  onEdge: 'sync',
  isFollowing: 'async',
  isBlocking: 'async',
  hops: 'async',
  help: 'sync',
  get: 'async',
  createFriendStream: 'source',
  stream: 'source'
}

exports.init = function (sbot, config) {
  const max = (config.friends && config.friends.hops) ||
              (config.replicate && config.replicate.hops) || 3
  const layered = LayeredGraph({ max, start: sbot.id })

  function isFollowing(opts, cb) {
    layered.onReady(() => {
      const g = layered.getGraph()
      cb(null, g[opts.source] && g[opts.source][opts.dest] >= 0)
    })
  }

  function isBlocking(opts, cb) {
    layered.onReady(() => {
      const g = layered.getGraph()
      cb(null, Math.round(g[opts.source] && g[opts.source][opts.dest]) === -1)
    })
  }

  // do not authorize peers blocked by this node
  sbot.auth.hook(function (fn, args) {
    const self = this
    isBlocking({ source: sbot.id, dest: args[0] }, (err, blocked) => {
      if (blocked) args[1](new Error('client is blocked'))
      else fn.apply(self, args)
    })
  })

  // replicate with everyone within max hops via ssb-ebt
  // (ssb-ebt hooks sbot.replicate.request and forwards to ebt.request)
  if (!sbot.replicate)
    throw new Error('ssb-friends expects ssb-replicate (or stub) to be available')

  pull(
    layered.hopStream({ live: true, old: true }),
    pull.drain((data) => {
      if (data.sync) return
      for (const k in data) {
        sbot.replicate.request(k, data[k] >= 0)
      }
    })
  )

  require('./contacts')(sbot, layered.createLayer, config)

  const classic = require('./legacy')(layered)

  // pass blocks to ebt.block
  setImmediate(() => {
    const block = (sbot.ebt && sbot.ebt.block) ||
                  (sbot.replicate && sbot.replicate.block)
    if (block) {
      function handleBlockUnlock(from, to, value) {
        if (value === false) block(from, to, true)
        else                 block(from, to, false)
      }
      pull(
        classic.stream({ live: true }),
        pull.drain((contacts) => {
          if (!contacts) return
          if (isFeed(contacts.from) && isFeed(contacts.to)) {
            handleBlockUnlock(contacts.from, contacts.to, contacts.value)
          } else {
            for (const from in contacts) {
              const relations = contacts[from]
              for (const to in relations)
                handleBlockUnlock(from, to, relations[to])
            }
          }
        })
      )
    }
  })

  return {
    hopStream: layered.hopStream,
    onEdge: layered.onEdge,
    isFollowing,
    isBlocking,
    createLayer: layered.createLayer,
    hops(opts, cb) {
      layered.onReady(() => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        cb(null, layered.getHops(opts))
      })
    },
    help: () => require('./help'),
    get: classic.get,
    createFriendStream: classic.createFriendStream,
    stream: classic.stream
  }
}
