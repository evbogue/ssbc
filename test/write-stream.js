'use strict'

const test     = require('tape')
const pull     = require('pull-stream')
const ssbKeys  = require('ssb-keys')
const dbPlugin = require('../lib/db')

const signCap = require('crypto').createHash('sha256').update('test write stream sign').digest()

function makeDb(label) {
  const server = {}
  return dbPlugin.init(server, {
    temp: 'ssbc-write-stream-test-' + label + '-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    keys: ssbKeys.generate(),
    caps: { sign: signCap }
  })
}

test('createWriteStream imports complete replication batches', (t) => {
  const source = makeDb('source')
  const target = makeDb('target')
  const messages = []
  let publishErr = null

  for (let i = 0; i < 250; i++) {
    source.publish({ type: 'post', text: 'replicated message ' + i }, (err, kvt) => {
      if (err) publishErr = err
      messages.push(kvt)
    })
  }
  t.error(publishErr, 'published source messages')

  pull(
    pull.values(messages),
    target.createWriteStream((err) => {
      t.error(err, 'bulk import completed')
      pull(
        target.createLogStream(),
        pull.collect((collectErr, imported) => {
          t.error(collectErr, 'read imported messages')
          t.equal(imported.length, messages.length, 'every message was imported')
          t.equal(imported[249].value.content.text, 'replicated message 249', 'feed order is preserved')
          t.end()
        })
      )
    })
  )
})
