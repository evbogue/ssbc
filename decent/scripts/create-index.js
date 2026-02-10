var path = require('path')
var patchbay = require('../../patchbay/public')

patchbay.writeStyleAssets({
  appDir: path.join(__dirname, '..')
})
