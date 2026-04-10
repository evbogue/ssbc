'use strict'

const pull = require('pull-stream')
const isFeed = require('../ref').isFeed

// Track contact messages (follow / unfollow / block) and feed them into the
// layered-graph layer. Replaces the old flumeview-reduce approach with a
// direct messagesByType scan against our SQLite store.

module.exports = function (sbot, createLayer, config) {
  const layer = createLayer('contacts')

  function contactValue(content) {
    if (content.blocking || content.flagged) return -1
    if (content.following === true) return 1
    return -2  // unfollow / neutral
  }

  function applyMsg(data) {
    if (data.sync) return
    const v = data.value
    if (!v || !v.content || typeof v.content !== 'object') return
    const from = v.author
    const to   = v.content.contact
    if (isFeed(from) && isFeed(to))
      layer(from, to, contactValue(v.content))
  }

  // Scan all existing contact messages to build the initial graph, then
  // subscribe live so new contacts are applied one-at-a-time.
  pull(
    sbot.messagesByType({ type: 'contact', old: true, live: false }),
    pull.filter((d) => d.value && d.value.content && typeof d.value.content === 'object'),
    pull.collect((err, msgs) => {
      if (err) return

      const g = {}
      for (const data of msgs) {
        const from = data.value.author
        const to   = data.value.content.contact
        if (isFeed(from) && isFeed(to)) {
          g[from] = g[from] || {}
          g[from][to] = contactValue(data.value.content)
        }
      }
      layer(g)  // bulk-load initial graph

      // Now tail new contact messages
      pull(
        sbot.messagesByType({ type: 'contact', old: false, live: true }),
        pull.drain(applyMsg)
      )
    })
  )
}
