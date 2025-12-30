var fs = require('fs')
var path = require('path')

var buildDir = path.join(__dirname, '..', 'build')
var stylePath = path.join(__dirname, '..', 'style.css')

if (!fs.existsSync(buildDir))
  fs.mkdirSync(buildDir)

fs.writeFileSync(
  path.join(__dirname, '..', 'style.css.json'),
  JSON.stringify(fs.readFileSync(stylePath, 'utf8'))
)

fs.writeFileSync(
  path.join(buildDir, 'style.css'),
  fs.readFileSync(stylePath, 'utf8')
)
