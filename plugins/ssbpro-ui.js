'use strict'

const createSkinPlugin = require('./ui-skin')

module.exports = createSkinPlugin({
  name: 'ssbpro-ui',
  namespace: 'ssbpro',
  port: 8991,
  stylesheet: 'ssbpro-style.css',
  launchMessage: 'ssbpro launched at',
  appName: 'ssbpro',
  themeColor: '#0a66c2'
})
