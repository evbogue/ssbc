'use strict'

const path = require('path')
const { createUiServer } = require('../lib/ui-server')

const DEFAULT_PORT = 8992

exports.name = 'decent2-ui'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  const buildDir = path.join(__dirname, '..', 'decent', 'build')
  const result = createUiServer(sbot, config, {
    pluginName: 'decent2-ui',
    configNamespace: 'decent2',
    defaultPort: DEFAULT_PORT,
    stylesheetName: 'decent2-style.css',
    buildDir,
    launchMessage: 'decent2 launched at',
    appName: 'decent2',
    themeColor: '#0088cc'
  })
  return { decent2: { port: result.port, host: result.host } }
}
