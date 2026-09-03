'use strict'

const createSkinPlugin = require('./ui-skin')

module.exports = createSkinPlugin({
  name: 'decent2-ui',
  namespace: 'decent2',
  port: 8992,
  stylesheet: 'decent2-style.css',
  launchMessage: 'decent2 launched at',
  appName: 'decent2',
  themeColor: '#0088cc'
})
