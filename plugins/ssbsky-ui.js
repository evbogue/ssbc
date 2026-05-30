'use strict'

const path = require('path')
const { createUiServer } = require('../lib/ui-server')

const DEFAULT_PORT = 8990

exports.name = 'ssbsky-ui'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  const buildDir = path.join(__dirname, '..', 'decent', 'build')
  const result = createUiServer(sbot, config, {
    pluginName: 'ssbsky-ui',
    configNamespace: 'ssbsky',
    defaultPort: DEFAULT_PORT,
    stylesheetName: 'ssbsky-style.css',
    buildDir,
    launchMessage: 'ssbsky launched at'
  })
  return { ssbsky: { port: result.port, host: result.host } }
}
