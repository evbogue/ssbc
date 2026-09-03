'use strict'

const createSkinPlugin = require('./ui-skin')

module.exports = createSkinPlugin({
  name: 'ssbski-ui',
  namespace: 'ssbski',
  port: 8990,
  stylesheet: 'ssbski-style.css',
  launchMessage: 'ssbski launched at',
  appName: 'ssbski',
  themeColor: '#1185fe'
})
