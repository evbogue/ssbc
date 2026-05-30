'use strict'

const path = require('path')
const { createUiServer } = require('../lib/ui-server')

const DEFAULT_PORT = 8888

exports.name = 'decent-ui'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  const buildDir = path.join(__dirname, '..', 'decent', 'build')
  const result = createUiServer(sbot, config, {
    pluginName: 'decent-ui',
    configNamespace: 'decent',
    defaultPort: DEFAULT_PORT,
    stylesheetName: 'style.css',
    buildDir,
    launchMessage: 'Decent launched at'
  })
  return { decent: { port: result.port, host: result.host } }
}
