'use strict'

const FlatMap = require('pull-flatmap')
const pull    = require('pull-stream')
const Notify  = require('pull-notify')

module.exports = function (layered) {
  function mapGraph(g, fn) {
    const _g = {}
    for (const j in g) {
      for (const k in g[j]) {
        _g[j] = _g[j] || {}
        _g[j][k] = fn(g[j][k])
      }
    }
    return _g
  }

  function mapValues(o, fn) {
    const _o = {}
    for (const k in o) _o[k] = fn(o[k])
    return _o
  }

  function toLegacyValue(v) {
    // follow/same-as → true, unfollow → null, block → false
    return v >= 0 ? true : v === -2 ? null : v === -1 ? false : null
  }

  const streamNotify = Notify()
  layered.onEdge((j, k, v) => {
    streamNotify({ from: j, to: k, value: toLegacyValue(v) })
  })

  return {
    createFriendStream(opts) {
      let first = true
      return pull(
        layered.hopStream(opts),
        FlatMap((change) => {
          const a = []
          for (const k in change) {
            if (!first || change[k] >= 0)
              a.push(opts && opts.meta ? { id: k, hops: change[k] } : k)
          }
          first = false
          return a
        })
      )
    },

    get(opts, cb) {
      if (!cb) { cb = opts; opts = {} }
      layered.onReady(() => {
        const value = layered.getGraph()
        if (opts && opts.source) {
          const src = value[opts.source]
          if (src && opts.dest) cb(null, toLegacyValue(src[opts.dest]))
          else                  cb(null, mapValues(src, toLegacyValue))
        } else if (opts && opts.dest) {
          const _value = {}
          for (const k in value)
            if (typeof value[k][opts.dest] !== 'undefined')
              _value[k] = value[k][opts.dest]
          cb(null, mapValues(_value, toLegacyValue))
        } else {
          cb(null, mapGraph(value, toLegacyValue))
        }
      })
    },

    stream() {
      const source = streamNotify.listen()
      layered.onReady(() => {
        source.push(mapGraph(layered.getGraph(), toLegacyValue))
      })
      return source
    }
  }
}
