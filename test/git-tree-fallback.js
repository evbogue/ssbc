const test = require('tape')
const loadTree = require('../decent/src/modules/git/load-tree')

test('repository landing recovers from an unreadable default branch', t => {
  const calls = []
  loadTree('master', ['main', 'master', 'main', 'topic'], (ref, cb) => {
    calls.push(ref)
    cb(ref === 'master' ? { status: 404 } : null, { entries: ['README.md'] })
  }, (err, data, ref) => {
    t.error(err)
    t.equal(ref, 'main', 'uses the readable branch for subsequent file links')
    t.deepEqual(data.entries, ['README.md'])
    t.deepEqual(calls, ['master', 'main'])
    t.end()
  })
})

test('tree recovery preserves valid defaults and explicit refs and stops on other errors', t => {
  const cases = [
    { error: null, alternatives: ['main'], expected: ['master'] },
    { error: { status: 404 }, alternatives: [], expected: ['master'] },
    { error: { status: 500 }, alternatives: ['main'], expected: ['master'] },
    { error: { status: 404 }, alternatives: ['main', 'main', 'master', 'topic'], expected: ['master', 'main', 'topic'] }
  ]
  cases.forEach(c => {
    const calls = []
    loadTree('master', c.alternatives, (ref, cb) => {
      calls.push(ref)
      cb(c.error, {})
    }, err => {
      t.equal(err, c.error, 'returns the final error')
      t.deepEqual(calls, c.expected, 'tries each eligible branch once')
    })
  })
  t.end()
})
