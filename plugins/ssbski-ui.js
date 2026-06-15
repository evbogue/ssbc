'use strict'

const path = require('path')
const { createUiServer } = require('../lib/ui-server')

const DEFAULT_PORT = 8990

exports.name = 'ssbski-ui'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  const buildDir = path.join(__dirname, '..', 'decent', 'build')
  const result = createUiServer(sbot, config, {
    pluginName: 'ssbski-ui',
    configNamespace: 'ssbski',
    defaultPort: DEFAULT_PORT,
    stylesheetName: 'ssbski-style.css',
    buildDir,
    launchMessage: 'ssbski launched at',
    appName: 'ssbski',
    themeColor: '#1185fe'
  })
  return { ssbski: { port: result.port, host: result.host } }
}
