var path = require('path')
var patchbay = require('../../patchbay/public')

patchbay.printRequireMap({
  baseDir: __dirname,
  targetDir: process.argv[2]
})

