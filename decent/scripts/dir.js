var path = require('path')
var patchbay = require('../../patchbay/public')

patchbay.printRequireMap({
  baseDir: process.cwd(),
  targetDir: process.argv[2],
  jsOnly: true,
  excludeName: 'index.js'
})

