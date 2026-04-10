'use strict'

const pull = require('pull-stream')

// In-memory name cache built from 'about' messages.
// Previously used sbot_links2 and sbot_query (Flume-based, now removed).
// Now queries the SQLite store directly via sbot_messagesByType.

let names = []
let ready = false
const waiting = []

function update (name) {
  const n = names.find(function (e) {
    return e.id === name.id && e.name === name.name
  })
  if (!n) {
    name.rank = name.rank || 1
    names.push(name)
  } else {
    n.rank = (n.rank || 0) + (name.rank || 1)
    if (name.ts > (n.ts || 0)) n.ts = name.ts
  }
}

function addSigil (e) {
  if (e && e.id && e.name && e.id[0] !== e.name[0])
    e.name = e.id[0] + e.name
  return e
}

function toNameEntry (d) {
  return addSigil({
    name: d.value.content.name,
    id:   d.value.content.about,
    ts:   d.timestamp || (d.value && d.value.timestamp) || 0,
    rank: 1
  })
}

function isAboutWithName (d) {
  return d && d.value && d.value.content &&
         typeof d.value.content.name === 'string' &&
         d.value.content.name.length > 0 &&
         d.value.content.about
}

exports.needs = {
  sbot_messagesByType: 'first'
}

exports.gives = {
  connection_status: true,
  signifier: true,
  signified: true
}

exports.create = function (api) {
  const out = {}

  out.connection_status = function (err) {
    if (err) return

    // Bulk-load historical about messages, then tail live ones
    pull(
      api.sbot_messagesByType({ type: 'about', old: true, live: false }),
      pull.filter(isAboutWithName),
      pull.map(toNameEntry),
      pull.collect(function (collectErr, entries) {
        if (!collectErr) {
          entries.forEach(update)
          ready = true
          while (waiting.length) waiting.shift()()
        }

        // Tail live about messages regardless of bulk-load outcome
        pull(
          api.sbot_messagesByType({ type: 'about', old: false, live: true }),
          pull.filter(isAboutWithName),
          pull.map(toNameEntry),
          pull.drain(update)
        )
      })
    )
  }

  function async (fn) {
    return function (value, cb) {
      function go () { cb(null, fn(value)) }
      if (ready) go()
      else waiting.push(go)
    }
  }

  function rank (ary) {
    return ary.sort(function (a, b) { return b.rank - a.rank || b.ts - a.ts })
  }

  out.signifier = async(function (id) {
    return rank(names.filter(function (e) { return e.id === id }))
  })

  out.signified = async(function (name) {
    const rx = new RegExp('^' + name)
    return rank(names.filter(function (e) { return rx.test(e.name) }))
  })

  return out
}
