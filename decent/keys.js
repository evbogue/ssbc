'use strict'
const path    = require('path')
const ssbKeys = require('ssb-keys')
const config  = require('ssb-config/inject')(process.env.ssb_appname)
const BROWSER_SECRET_KEY = 'decent/.ssb/secret'

function loadBrowserKeys() {
  try {
    const stored = localStorage[BROWSER_SECRET_KEY]
    if (stored && stored !== 'undefined') return JSON.parse(stored)
  } catch (_) {}

  const keys = ssbKeys.generate()
  try {
    localStorage[BROWSER_SECRET_KEY] = JSON.stringify(keys, null, 2)
  } catch (_) {}
  return keys
}

module.exports = typeof window !== 'undefined'
  ? loadBrowserKeys()
  : ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))
