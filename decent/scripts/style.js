var fs = require('fs')
var path = require('path')
var patchbay = require('../../patchbay/public')

var buildDir = path.join(__dirname, '..', 'build')

if (!fs.existsSync(buildDir))
  fs.mkdirSync(buildDir)

patchbay.writeStyleAssets({
  appDir: path.join(__dirname, '..'),
  copyCssToBuild: true
})
