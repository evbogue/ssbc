var fs = require('fs')
var path = require('path')

var htmlPath = path.join(__dirname, '..', 'build', 'index.html')
if (!fs.existsSync(htmlPath)) process.exit(0)

var html = fs.readFileSync(htmlPath, 'utf8')
if (html.indexOf('decent-preload') !== -1) process.exit(0)

var headClose = html.indexOf('</head>')
if (headClose === -1) process.exit(0)

var insert = [
  '<!-- decent-preload -->',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="preload" as="style" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/css/bootstrap.min.css">',
  '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/css/bootstrap.min.css">',
  '<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0">',
  '<link rel="preload" as="style" href="/style.css">',
  '<link rel="stylesheet" href="/style.css">'
].join('\n') + '\n'

html = html.slice(0, headClose) + insert + html.slice(headClose)

fs.writeFileSync(htmlPath, html)
