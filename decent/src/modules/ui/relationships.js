var pull = require('pull-stream')

// Follow graph, derived from `contact` messages via the links index.
//
// We deliberately use sbot_links (rel:'contact') rather than sbot_query: the
// SQLite data layer returns empty for sbot_query, which silently zeroed every
// follower/following count and broke the follow-button state. A contact message
// `{type:'contact', contact:@x, following:bool}` is indexed as a link
// src=author → dest=@x, rel='contact', so the follow graph is exactly the set
// of contact links with the latest `following` state per (source,dest) pair.

exports.needs = { sbot_links: 'first' }

exports.gives = {
  follows: true,
  followers: true,
  follower_of: true
}

exports.create = function (api) {

  // Reduce a set of contact links to the "other end" ids that are currently
  // followed. `otherKey` is 'dest' (who a feed follows) or 'source' (who
  // follows a feed). Links arrive in insertion order, which is per-feed
  // sequence order, so the last value for a pair wins (handles later unfollows).
  function latestFollowed (links, otherKey) {
    var state = {} // otherId -> following(bool)
    links.forEach(function (l) {
      var c = l && l.value && l.value.content
      if (!c || c.type !== 'contact') return
      var other = l[otherKey]
      if (typeof c.following === 'boolean') state[other] = c.following
      else if (c.blocking === true)        state[other] = false
    })
    return Object.keys(state).filter(function (id) { return state[id] === true })
  }

  // A pull-source that defers until an async build(cb) -> cb(err, array)
  // resolves, then streams the array. Lets follows/followers keep their
  // existing "returns a source" contract while we collect links first.
  function deferredSource (build) {
    var ready = false, buffer = null, error = null, waiting = []
    build(function (err, arr) {
      error = err; buffer = arr || []; ready = true
      var w = waiting; waiting = []
      w.forEach(function (fn) { fn() })
    })
    var i = 0
    return function read (abort, cb) {
      if (!ready) return waiting.push(function () { read(abort, cb) })
      if (error)  return cb(error)
      if (abort)  return cb(abort)
      if (i >= buffer.length) return cb(true)
      cb(null, buffer[i++])
    }
  }

  return {
    // ids that `id` follows
    follows: function (id) {
      return deferredSource(function (cb) {
        pull(
          api.sbot_links({ source: id, rel: 'contact', values: true }),
          pull.collect(function (err, links) {
            if (err) return cb(err)
            cb(null, latestFollowed(links, 'dest'))
          })
        )
      })
    },

    // ids that follow `id`
    followers: function (id) {
      return deferredSource(function (cb) {
        pull(
          api.sbot_links({ dest: id, rel: 'contact', values: true }),
          pull.collect(function (err, links) {
            if (err) return cb(err)
            cb(null, latestFollowed(links, 'source'))
          })
        )
      })
    },

    // does `source` currently follow `dest`? cb(null, true | false | undefined)
    follower_of: function (source, dest, cb) {
      pull(
        api.sbot_links({ source: source, dest: dest, rel: 'contact', values: true }),
        pull.collect(function (err, links) {
          if (err) return cb(err)
          var following
          links.forEach(function (l) {
            var c = l && l.value && l.value.content
            if (c && typeof c.following === 'boolean') following = c.following
          })
          cb(null, following)
        })
      )
    }
  }

}
