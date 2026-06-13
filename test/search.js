'use strict'

// Exercises lib/db.js search() directly: it must index published content,
// match real queries, and — critically — never throw on malformed FTS5 input
// (search is in the anonymous permission allowlist, so a remote caller can send
// arbitrary query strings).

const test    = require('tape')
const os      = require('os')
const path    = require('path')
const ssbKeys = require('ssb-keys')
const dbPlugin = require('../lib/db')

function makeDb() {
  const config = {
    temp: 'ssbc-search-test-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    keys: ssbKeys.generate(),
    caps: { sign: require('crypto').createHash('sha256').update('test search sign').digest() }
  }
  // init() returns the db interface and also assigns it to server.db.
  const server = {}
  return dbPlugin.init(server, config)
}

test('search indexes and matches published content', (t) => {
  const db = makeDb()
  // publish a couple of posts via the local publish path
  db.publish({ type: 'post', text: 'hello scuttlebutt world' }, (err) => {
    t.error(err, 'published first post')
    db.publish({ type: 'post', text: 'goodbye cruel world' }, (err2) => {
      t.error(err2, 'published second post')

      db.search('scuttlebutt', (e, hits) => {
        t.error(e, 'search returned without error')
        t.equal(hits.length, 1, 'one hit for "scuttlebutt"')
        t.ok(/scuttlebutt/.test(hits[0].value.content.text), 'hit contains the term')

        db.search('world', (e2, hits2) => {
          t.error(e2, 'search "world" ok')
          t.equal(hits2.length, 2, 'both posts match "world"')
          t.end()
        })
      })
    })
  })
})

test('search does not throw on malformed FTS5 queries', (t) => {
  const db = makeDb()
  db.publish({ type: 'post', text: 'indexed content here' }, (err) => {
    t.error(err, 'published')

    // Each of these is invalid FTS5 query *syntax* and would throw
    // "unterminated string" / "syntax error" if passed to MATCH unsanitized.
    const malformed = ['"', '(', ')', 'NEAR(', '"unterminated', 'a AND', '* foo', '^']
    let pending = malformed.length

    malformed.forEach((q) => {
      // The call must reach its callback (no synchronous throw) and not error.
      try {
        db.search(q, (e, hits) => {
          t.error(e, 'no error callback for query ' + JSON.stringify(q))
          t.ok(Array.isArray(hits), 'array result for ' + JSON.stringify(q))
          if (--pending === 0) t.end()
        })
      } catch (ex) {
        t.fail('search threw synchronously for ' + JSON.stringify(q) + ': ' + ex.message)
        if (--pending === 0) t.end()
      }
    })
  })
})

test('search clamps limit and handles empty queries', (t) => {
  const db = makeDb()
  db.search('', (e, hits) => {
    t.error(e, 'empty query ok')
    t.deepEqual(hits, [], 'empty query returns []')

    db.search({ query: 'anything', limit: 1e9 }, (e2, hits2) => {
      t.error(e2, 'huge limit ok')
      t.ok(Array.isArray(hits2), 'array result with clamped limit')
      t.end()
    })
  })
})
