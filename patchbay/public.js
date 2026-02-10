var fs = require('fs')
var path = require('path')

function printRequireMap (opts) {
  var options = opts || {}
  var baseDir = options.baseDir
  var targetDir = options.targetDir

  if (!baseDir || typeof baseDir !== 'string')
    throw new Error('printRequireMap requires opts.baseDir')
  if (!targetDir || typeof targetDir !== 'string')
    throw new Error('printRequireMap requires opts.targetDir')

  var excludeName = options.excludeName
  var jsOnly = !!options.jsOnly

  var files = fs.readdirSync(path.join(baseDir, targetDir))
  if (jsOnly) {
    files = files.filter(function (file) {
      if (excludeName && file === excludeName) return false
      return /\.js$/.test(file)
    })
  }

  console.log(
    'module.exports = {\n'
    +
    files.map(function (file) {
      return '  ' + JSON.stringify(file) + ":  require('./" + file + "')"
    }).join(',\n')
    +
    '\n}'
  )
}

function writeStyleAssets (opts) {
  var options = opts || {}
  var appDir = options.appDir

  if (!appDir || typeof appDir !== 'string')
    throw new Error('writeStyleAssets requires opts.appDir')

  var stylePath = path.join(appDir, 'style.css')
  var styleJsonPath = path.join(appDir, 'style.css.json')
  var style = fs.readFileSync(stylePath, 'utf8')

  fs.writeFileSync(styleJsonPath, JSON.stringify(style))

  if (options.copyCssToBuild) {
    var buildDir = path.join(appDir, 'build')
    if (!fs.existsSync(buildDir))
      fs.mkdirSync(buildDir)
    fs.writeFileSync(path.join(buildDir, 'style.css'), style)
  }
}

module.exports = {
  printRequireMap: printRequireMap,
  writeStyleAssets: writeStyleAssets
}
