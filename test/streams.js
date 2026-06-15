'use strict'

const test     = require('tape')
const pull     = require('pull-stream')
const ssbKeys  = require('ssb-keys')
const dbPlugin = require('../lib/db')

function makeDb() {
  const server = {}
  return dbPlugin.init(server, {
    temp: 'ssbc-stream-test-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    keys: ssbKeys.generate(),
    caps: { sign: require('crypto').createHash('sha256').update('test stream sign').digest() }
  })
}

function publish(db, content) {
  let result
  db.publish(content, (err, kvt) => {
    if (err) throw err
    result = kvt
  })
  return result
}

test('createLogStream reads lazily and tolerates concurrent writes', (t) => {
  const db = makeDb()
  for (let i = 0; i < 30; i++) publish(db, { type: 'post', text: 'existing ' + i })

  const stream = db.createLogStream()
  stream(null, (err, first) => {
    t.error(err, 'read first row')
    t.equal(first.value.content.text, 'existing 0', 'first row is correct')

    publish(db, { type: 'post', text: 'written during iteration' })
    pull(
      stream,
      pull.collect((collectErr, remaining) => {
        t.error(collectErr, 'drained iterator after concurrent write')
        t.equal(remaining.length, 29, 'iterator retains its original snapshot')
        t.equal(remaining[28].value.content.text, 'existing 29', 'snapshot excludes later write')
        t.end()
      })
    )
  })
})

test('streams can stop after a small prefix', (t) => {
  const db = makeDb()
  for (let i = 0; i < 200; i++) publish(db, { type: 'post', text: 'prefix ' + i })

  pull(
    db.createLogStream(),
    pull.take(5),
    pull.collect((err, messages) => {
      t.error(err, 'read prefix')
      t.equal(messages.length, 5, 'consumer can stop after five rows')
      t.equal(messages[4].value.content.text, 'prefix 4', 'prefix is ordered')
      t.end()
    })
  )
})

test('live streams emit concurrent writes once after the sync marker', (t) => {
  const db = makeDb()
  for (let i = 0; i < 3; i++) publish(db, { type: 'post', text: 'live existing ' + i })

  const stream = db.createLogStream({ live: true })
  stream(null, (err, first) => {
    t.error(err, 'read first existing row')
    t.equal(first.value.content.text, 'live existing 0', 'first existing row is correct')
    publish(db, { type: 'post', text: 'live concurrent' })

    pull(
      stream,
      pull.take(4),
      pull.collect((collectErr, items) => {
        t.error(collectErr, 'read through concurrent live row')
        t.deepEqual(
          items.map((item) => item.sync ? 'sync' : item.value.content.text),
          ['live existing 1', 'live existing 2', 'sync', 'live concurrent'],
          'concurrent write appears once after the snapshot'
        )
        t.end()
      })
    )
  })
})

test('links honors limit', (t) => {
  const db = makeDb()
  const root = publish(db, { type: 'post', text: 'root' })
  for (let i = 0; i < 20; i++) {
    publish(db, { type: 'post', text: 'reply ' + i, root: root.key })
  }

  pull(
    db.links({ dest: root.key, rel: 'root', limit: 10 }),
    pull.collect((err, links) => {
      t.error(err, 'read links')
      t.equal(links.length, 10, 'limit bounds link results')
      t.end()
    })
  )
})
