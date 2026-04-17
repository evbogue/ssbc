'use strict'

const pull         = require('pull-stream')
const ssbKeys      = require('ssb-keys')
const ref          = require('ssb-ref')
const Reconnect    = require('pull-reconnect')
const createClient = require('ssb-client')
const createConfig = require('ssb-config/inject')
const keys         = require('../../keys')

const config = createConfig(process.env.ssb_appname)

const CACHE = {}
if (typeof window !== 'undefined') window.CACHE = CACHE

module.exports = {
  needs: {
    connection_status: 'map'
  },
  gives: {
    sbot_links:          true,
    sbot_links2:         true,
    sbot_query:          true,
    sbot_messagesByType: true,
    sbot_get:            true,
    sbot_add:            true,
    sbot_getLatest:      true,
    sbot_log:            true,
    sbot_user_feed:      true,
    sbot_gossip_peers:   true,
    sbot_gossip_connect: true,
    sbot_progress:       true,
    sbot_publish:        true,
    sbot_whoami:         true,
    sbot_search:         true
  },

  create: function (api) {
    let sbot = null

    const rec = Reconnect(function (isConn) {
      function notify (value) {
        isConn(value)
        api.connection_status(value)
      }

      createClient(keys, {
        manifest: require('../../../manifest.json'),
        remote:   require('../../config')().remote,
        caps:     config.caps
      }, function (err, _sbot) {
        if (err) return notify(err)
        sbot = _sbot
        sbot.on('closed', function () {
          sbot = null
          notify(new Error('closed'))
        })
        notify()
      })
    })

    return {
      sbot_links: rec.source(function (query) {
        return sbot.links(query)
      }),

      // ssb-links and ssb-query use Flume internals — return empty instead of crashing
      sbot_links2: function () {
        return pull.empty()
      },
      sbot_query: rec.source(function (opts) {
        return sbot.query.read(opts)
      }),

      // Direct messagesByType query against our SQLite store
      sbot_messagesByType: rec.source(function (opts) {
        return sbot.messagesByType(opts)
      }),

      sbot_log: rec.source(function (opts) {
        return pull(
          sbot.createLogStream(opts),
          pull.through(function (e) {
            CACHE[e.key] = CACHE[e.key] || e.value
          })
        )
      }),

      sbot_user_feed: rec.source(function (opts) {
        return sbot.createUserStream(opts)
      }),

      sbot_get: rec.async(function (key, cb) {
        if (typeof cb !== 'function')
          throw new Error('cb must be function')
        if (CACHE[key]) return cb(null, CACHE[key])
        sbot.get(key, function (err, value) {
          if (err) return cb(err)
          cb(null, CACHE[key] = value)
        })
      }),

      sbot_add: rec.async(function (msgValue, cb) {
        sbot.add(msgValue, cb)
      }),

      sbot_getLatest: rec.async(function (feedId, cb) {
        sbot.getLatest(feedId, cb)
      }),

      sbot_gossip_peers: rec.async(function (cb) {
        sbot.gossip.peers(cb)
      }),

      sbot_gossip_connect: rec.async(function (opts, cb) {
        sbot.gossip.connect(opts, cb)
      }),

      // replicate.changes is from ssb-replicate (removed); return empty stream
      sbot_progress: function () {
        return pull.empty()
      },

      sbot_publish: rec.async(function (content, cb) {
        if (content.recps) {
          content = ssbKeys.box(content, content.recps.map(function (e) {
            return ref.isFeed(e) ? e : e.link
          }))
        } else if (content.mentions) {
          content.mentions.forEach(function (mention) {
            if (ref.isBlob(mention.link)) {
              sbot.blobs.push(mention.link, function (err) {
                if (err) console.error(err)
              })
            }
          })
        }
        sbot.publish(content, cb)
      }),

      sbot_whoami: rec.async(function (cb) {
        sbot.whoami(cb)
      }),

      sbot_search: rec.async(function (opts, cb) {
        sbot.search(opts, cb)
      })
    }
  }
}
