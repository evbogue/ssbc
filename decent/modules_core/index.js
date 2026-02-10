var patchbayCore = require('../../patchbay/modules_core')

module.exports = Object.assign({}, patchbayCore, {
  'app.js': require('./app.js')
})

delete module.exports['tabs.js']
