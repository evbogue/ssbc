var path = require('path')
var patchbay = require('../public')

patchbay.writeStyleAssets({
  appDir: path.join(__dirname, '..')
})
