'use strict'

const test     = require('tape')
const pull     = require('pull-stream')
const ssbKeys  = require('ssb-keys')
const dbPlugin = require('../lib/db')
const queryPlugin = require('ssb-query')

function makeQuery() {
  const server = {}
  const db = dbPlugin.init(server, {
    temp: 'ssbc-query-test-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    keys: ssbKeys.generate(),
    caps: { sign: require('crypto').createHash('sha256').update('test query sign').digest() }
  })
  return queryPlugin.init(db, {})
}

test('query.read fails loudly in SQLite mode', (t) => {
  pull(
    makeQuery().read({ query: [] }),
    pull.collect((err, messages) => {
      t.ok(err, 'returns an error')
      t.equal(
        err.message,
        'query.read is not supported in SQLite mode — use messagesByType or links',
        'error points to supported alternatives'
      )
      t.deepEqual(messages, [], 'emits no partial results before the error')
      t.end()
    })
  )
})
