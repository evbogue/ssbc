'use strict'
const path    = require('path')
const ssbKeys = require('ssb-keys')
const config  = require('ssb-config/inject')(process.env.ssb_appname)
module.exports = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))
