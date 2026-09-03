'use strict'

const path = require('path')
const { createUiServer } = require('../lib/ui-server')

function createSkinPlugin(opts) {
  const {
    name,
    namespace,
    port,
    stylesheet,
    launchMessage,
    appName,
    themeColor,
    useWsPortFallback
  } = opts

  const plugin = {
    name,
    version: '1.0.0',
    manifest: {}
  }

  plugin.init = function (sbot, config) {
    const buildDir = path.join(__dirname, '..', 'decent', 'build')
    const result = createUiServer(sbot, config, {
      pluginName: name,
      configNamespace: namespace,
      defaultPort: port,
      stylesheetName: stylesheet,
      buildDir,
      launchMessage,
      useWsPortFallback,
      appName,
      themeColor
    })
    const api = {}
    api[namespace] = { port: result.port, host: result.host }
    return api
  }

  return plugin
}

module.exports = createSkinPlugin
