'use strict'

const path = require('path')
const { createUiServer } = require('../lib/ui-server')

const DEFAULT_PORT = 8991

exports.name = 'ssbpro-ui'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  const buildDir = path.join(__dirname, '..', 'decent', 'build')
  const result = createUiServer(sbot, config, {
    pluginName: 'ssbpro-ui',
    configNamespace: 'ssbpro',
    defaultPort: DEFAULT_PORT,
    stylesheetName: 'ssbpro-style.css',
    buildDir,
    launchMessage: 'ssbpro launched at',
    appName: 'ssbpro',
    themeColor: '#0a66c2'
  })
  return { ssbpro: { port: result.port, host: result.host } }
}
