'use strict'

// A filesystem-backed Storage shim for running a light node headless (Node, no
// browser). Same { getItem, setItem, removeItem } interface Light/Relay expect,
// persisted to a single JSON file so identity and replicated feeds survive
// across process restarts.

const fs   = require('fs')
const os   = require('os')
const path = require('path')

module.exports = function fileStore (dir) {
  dir = dir || path.join(os.homedir(), '.ssb-light')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'store.json')

  let data = {}
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) {}

  function flush () {
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, file)                 // atomic replace
  }

  return {
    dir: dir,
    file: file,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); flush() },
    removeItem: (k) => { delete data[k]; flush() }
  }
}
