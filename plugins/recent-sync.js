'use strict'

const pull = require('pull-stream')
const ref = require('ssb-ref')

function options(opts) {
  const { id, before = null, limit = 32 } = opts || {}
  if (!ref.isFeed(id)) throw new Error('recentSync: id must be a classic feed ID')
  if (before !== null && (!Number.isSafeInteger(before) || before < 1)) {
    throw new Error('recentSync: before must be a positive sequence number')
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 128) {
    throw new Error('recentSync: limit must be between 1 and 128')
  }
  return { id, before, limit }
}

module.exports = {
  name: 'recentSync',
  version: '1.0.0',
  manifest: { history: 'source', pull: 'async', read: 'source', reset: 'async' },
  permissions: { anonymous: { allow: ['history'] } },
  init(sbot) {
    const store = sbot.db.recent
    const active = new Set()

    function history(opts) {
      try {
        const { id, before, limit } = options(opts)
        return sbot.createHistoryStream({ id, lt: before, limit, reverse: true })
      } catch (err) { return pull.error(err) }
    }

    function read(opts) {
      try {
        const { id, before, limit } = options(opts)
        return pull.values(store.read(id, before === null ? Number.MAX_SAFE_INTEGER : before - 1, limit))
      } catch (err) { return pull.error(err) }
    }

    function sync(opts, cb) {
      let id, limit, remote, state
      try {
        ({ id, limit } = options(opts))
        remote = opts.remote
        if (id === sbot.id) throw new Error('recentSync: use normal replication to restore your own feed')
        if (typeof remote !== 'string' || !remote) throw new Error('recentSync: a peer address is required')
        if (active.has(id)) throw new Error('recentSync: a pull is already in progress for this feed')
        state = store.status(id)
      } catch (err) { return cb(err) }

      function save(page) {
        let result
        try { result = store.commit(id, state.before, page, limit) }
        catch (err) { return finish(err) }
        finish(null, result)
      }

      active.add(id)
      let rpc
      let done = false
      const timer = setTimeout(() => finish(new Error('recentSync: peer request timed out')), 15000)
      function finish(err, result) {
        if (done) return
        done = true
        clearTimeout(timer)
        active.delete(id)
        if (rpc) rpc.close(true)
        cb(err, result)
      }

      // A connected suffix may require several bounded promotion steps. These
      // steps are local and can resume even when the original peer is offline.
      if (!state.complete && state.before === null) return save([])

      try {
        sbot.connect(remote, (err, peer) => {
          if (done) {
            if (peer) peer.close(true)
            return
          }
          if (err) return finish(err)
          rpc = peer
          const source = rpc.recentSync.history({ id, before: state.before, limit })
          pull(source, pull.take(limit + 1), pull.collect((err, page) => {
            if (done) return
            if (err) return finish(err)
            if (page.length > limit) return finish(new Error('recentSync: peer exceeded page size'))
            save(page)
          }))
        })
      } catch (err) { finish(err) }
    }

    function reset(id, cb) {
      let count
      try {
        options({ id })
        if (active.has(id)) throw new Error('recentSync: a pull is already in progress for this feed')
        count = store.reset(id)
      } catch (err) { return cb(err) }
      cb(null, count)
    }

    return { history, pull: sync, read, reset }
  }
}
