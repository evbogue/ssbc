var fs = require('fs')
var http = require('http')
var path = require('path')

var DEFAULT_PORT = 9080
var DEFAULT_HOST = '127.0.0.1'
var MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

function getContentType (filePath) {
  var ext = path.extname(filePath).toLowerCase()
  return MIME_MAP[ext] || 'application/octet-stream'
}

function resolvePath (reqPath) {
  var pathname = (reqPath || '/').split('?')[0]
  if (!pathname || pathname === '/') pathname = '/index.html'
  var relative = pathname.replace(/^\/+/, '')
  if (!relative) relative = 'index.html'
  if (relative.indexOf('..') !== -1) return null
  return relative
}

exports.name = 'phoenix-ui'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  var phoenixDir = path.join(__dirname, '..', 'phoenix')
  var cfg = config && config.phoenix ? config.phoenix : {}
  var port = typeof cfg.port === 'number' ? cfg.port : DEFAULT_PORT
  var host = typeof cfg.host === 'string' ? cfg.host : DEFAULT_HOST

  function respondNotFound (res) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not found')
  }

  function respondInvalid (res) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Invalid request')
  }

  function serveStatic (req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respondInvalid(res)
      return
    }

    var relPath = resolvePath(req.url)
    if (!relPath) {
      respondInvalid(res)
      return
    }

    var filePath = path.join(phoenixDir, relPath)
    fs.stat(filePath, function (err, stat) {
      if (err || !stat || !stat.isFile()) {
        respondNotFound(res)
        return
      }

      res.writeHead(200, {'Content-Type': getContentType(filePath)})

      if (req.method === 'HEAD') {
        res.end()
        return
      }

      fs.createReadStream(filePath).pipe(res)
    })
  }

  var server = http.createServer(serveStatic)

  server.on('error', function (err) {
    console.error('phoenix-ui server error:', err.message || err)
  })

  server.listen(port, host, function () {
    var addr = server.address()
    var address = addr && addr.address ? addr.address : host
    var listeningPort = addr && addr.port ? addr.port : port
    console.log('Phoenix feed view available at http://' + address + ':' + listeningPort + '/')
  })

  var closed = false
  function closeServer (cb) {
    if (closed) return cb && cb()
    closed = true
    server.close(function () {
      cb && cb()
    })
  }

  process.once('exit', closeServer)

  return {
    phoenix: {
      port: port,
      host: host
    }
  }
}
