#!/usr/bin/env node
'use strict'

// Headless light SSB node — no browser, no GUI, no sbot server.
//
//   node light/cli.js whoami
//   node light/cli.js publish "hello world"
//   node light/cli.js private @feedId... "a secret"
//   node light/cli.js log
//   node light/cli.js follow-add @feedId          # record that you follow a feed
//   node light/cli.js following
//   node light/cli.js sync   <ws-address> [@feed...]   # push + pull (follow graph if no feeds)
//   node light/cli.js watch  <ws-address> [@feed...]   # like sync, but stay live
//
// Identity + feeds are stored under $SSB_LIGHT_PATH (default ~/.ssb-light).
// A ws-address looks like: ws://host:port~shs:<pubkey>  (the node's key without
// the leading @ and trailing .ed25519). Default network caps; override with
// $SSB_LIGHT_CAPS. A default relay can be set with $SSB_LIGHT_REMOTE.

const os        = require('os')
const path      = require('path')
const Light     = require('./light')
const Relay     = require('./relay')
const fileStore = require('./store-fs')

const dir   = process.env.SSB_LIGHT_PATH || path.join(os.homedir(), '.ssb-light')
const store = fileStore(dir)
const node  = new Light({ store: store })

const argv = process.argv.slice(2)
const cmd  = argv.shift()

const caps = process.env.SSB_LIGHT_CAPS ? { shs: process.env.SSB_LIGHT_CAPS } : undefined
function remoteFrom (arg) { return arg || process.env.SSB_LIGHT_REMOTE }

function bodyOf (kv) {
  const opened = node.unbox(kv)
  const c = opened || kv.value.content
  if (typeof c === 'string') return '[encrypted]'
  return c.text || (c.type ? '[' + c.type + ']' : JSON.stringify(c))
}

function die (msg) { console.error(msg); process.exit(1) }

switch (cmd) {
  case 'whoami':
    console.log(node.id)
    break

  case 'publish': {
    const text = argv.join(' ')
    if (!text) die('usage: publish "text"')
    console.log(node.publish({ type: 'post', text: text }).key)
    break
  }

  case 'private': {
    const recips = argv.filter((a) => a.indexOf('@') === 0)
    const text = argv.filter((a) => a.indexOf('@') !== 0).join(' ')
    if (!recips.length || !text) die('usage: private @feedId [@feedId...] "text"')
    console.log(node.publishPrivate({ type: 'post', text: text }, recips).key)
    break
  }

  case 'log':
  case 'read':
    node.log().forEach((kv) => {
      console.log(kv.value.sequence + '\t' + kv.key + '\t' + bodyOf(kv))
    })
    break

  case 'follow-add':
  case 'follow-rm': {
    const feed = argv[0]
    if (!feed) die('usage: ' + cmd + ' @feedId')
    node.publish({ type: 'contact', contact: feed, following: cmd === 'follow-add' })
    console.log((cmd === 'follow-add' ? 'following ' : 'unfollowed ') + feed)
    break
  }

  case 'following': {
    const relay = new Relay(node, { caps: caps })   // offline; just reads our log
    relay.following().forEach((id) => console.log(id))
    break
  }

  case 'sync':
  case 'watch': {
    const remote = remoteFrom(argv.shift())
    if (!remote) die('usage: ' + cmd + ' <ws-address> [@feed...]   (or set $SSB_LIGHT_REMOTE)')
    const feeds = argv.filter((a) => a.indexOf('@') === 0)
    const live = cmd === 'watch'
    const relay = new Relay(node, {
      remote: remote,
      caps: caps,
      onMessage: (kv, fid) => console.log(fid.slice(0, 10) + '…\t' + kv.value.sequence + '\t' + bodyOf(kv))
    })
    relay.connect((err) => {
      if (err) die('connect failed: ' + (err.message || err))
      console.error('connected to ' + remote)
      if (live) {
        relay.push(() => {})
        ;(feeds.length ? feeds : relay.following().concat(node.id)).forEach((f) => relay.follow(f))
        console.error('watching… (ctrl-c to stop)')
      } else if (feeds.length) {
        relay.sync(feeds, (err) => { if (err) die(err.message); console.error('synced'); relay.close(() => process.exit(0)) })
      } else {
        relay.syncFollows((err) => { if (err) die(err.message); console.error('synced follow graph'); relay.close(() => process.exit(0)) })
      }
    })
    break
  }

  default:
    console.error('light — a headless SSB node\n')
    console.error('commands: whoami | publish | private | log | follow-add | follow-rm |')
    console.error('          following | sync <ws-addr> [@feed...] | watch <ws-addr> [@feed...]')
    console.error('\nstore: ' + store.file)
    process.exit(cmd ? 1 : 0)
}
