'use strict'

const test = require('tape')

test('loading the SQLite database restores process.emitWarning', (t) => {
  const original = process.emitWarning
  require('../lib/db')
  t.equal(process.emitWarning, original, 'global warning handler is restored after node:sqlite loads')
  t.end()
})
