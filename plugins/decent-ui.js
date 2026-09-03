'use strict'

const createSkinPlugin = require('./ui-skin')

module.exports = createSkinPlugin({
  name: 'decent-ui',
  namespace: 'decent',
  port: 8888,
  stylesheet: 'decent2-style.css',
  launchMessage: 'Decent launched at',
  useWsPortFallback: true,
  appName: 'Decent',
  themeColor: '#0088cc'
})
