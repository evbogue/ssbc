var fs = require('fs')
var http = require('http')
var path = require('path')

var DEFAULT_PORT = 8888
var DEFAULT_HOST = 'localhost'
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

exports.name = 'decent-ui'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  var decentDir = path.join(__dirname, '..', 'decent', 'build')
  var cfg = config && config.decent ? config.decent : {}
  console.log('decent-ui config:', JSON.stringify(cfg))
  var port = typeof cfg.port === 'number' ? cfg.port : DEFAULT_PORT
  var host = DEFAULT_HOST
  var wsCfg = config && config.ws ? config.ws : {}
  var wsPort = typeof wsCfg.port === 'number' ? wsCfg.port : 8989
  var wsHost = typeof cfg.wsHost === 'string' ? cfg.wsHost : null
  var wsRemote = typeof cfg.wsRemote === 'string' ? cfg.wsRemote : null
  var loggedRemote = false
  if (!wsHost && typeof wsCfg.host === 'string')
    wsHost = wsCfg.host

  function splitHostPort (rawHost) {
    if (!rawHost || typeof rawHost !== 'string') return null
    if (rawHost[0] === '[') {
      var end = rawHost.indexOf(']')
      if (end === -1) return {host: rawHost, port: null}
      var rest = rawHost.slice(end + 1)
      if (rest[0] === ':' && /^\d+$/.test(rest.slice(1)))
        return {host: rawHost.slice(0, end + 1), port: Number(rest.slice(1))}
      return {host: rawHost, port: null}
    }
    if (/:\\d+$/.test(rawHost)) {
      var lastColon = rawHost.lastIndexOf(':')
      return {host: rawHost.slice(0, lastColon), port: Number(rawHost.slice(lastColon + 1))}
    }
    return {host: rawHost, port: null}
  }

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

  function getBaseHost (hostHeader) {
    if (!hostHeader || typeof hostHeader !== 'string') return null
    if (hostHeader[0] === '[') {
      var end = hostHeader.indexOf(']')
      if (end === -1) return hostHeader
      return hostHeader.slice(0, end + 1)
    }
    var colon = hostHeader.indexOf(':')
    if (colon === -1) return hostHeader
    return hostHeader.slice(0, colon)
  }

  function getRemoteForRequest (req) {
    if (!sbot || !sbot.id || typeof sbot.id !== 'string') return null
    if (!req || !req.headers) return null

    var hostHeader = req.headers['x-forwarded-host'] || req.headers.host
    var baseHost = getBaseHost(hostHeader)
    if (!baseHost) return null

    var proto = 'http'
    if (req.connection && req.connection.encrypted)
      proto = 'https'
    else if (typeof req.headers['x-forwarded-proto'] === 'string')
      proto = req.headers['x-forwarded-proto'].split(',')[0].trim()

    var wsProto = proto === 'https' ? 'wss' : 'ws'

    var i = sbot.id.indexOf('.')
    var key = i === -1 ? sbot.id.substring(1) : sbot.id.substring(1, i)

    if (wsRemote) {
      var explicitRemote = wsRemote + '~shs:' + key
      if (!loggedRemote) {
        loggedRemote = true
        console.log('decent-ui ws remote:', explicitRemote)
      }
      return explicitRemote
    }

    var wsTarget = wsHost || baseHost
    var parsedHost = splitHostPort(wsTarget)
    var hostName = parsedHost ? parsedHost.host : wsTarget
    var hostPort = parsedHost && parsedHost.port ? parsedHost.port : wsPort

    var remote = wsProto + '://' + hostName + ':' + hostPort + '~shs:' + key
    if (!loggedRemote) {
      loggedRemote = true
      console.log('decent-ui ws remote:', remote)
    }
    return remote
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

    var filePath = path.join(decentDir, relPath)
    function serveFile (resolvedPath) {
      if (relPath === 'index.html' && req.method === 'GET') {
        return fs.readFile(resolvedPath, 'utf8', function (readErr, html) {
          if (readErr) {
            respondNotFound(res)
            return
          }

          var headInsert = ''
          if (html.indexOf('rel="stylesheet" href="/style.css"') === -1 &&
            html.indexOf('rel="stylesheet" href="style.css"') === -1) {
            headInsert += '<link rel="preload" as="style" href="/style.css">' +
              '<link rel="stylesheet" href="/style.css">'
          }

          var remote = getRemoteForRequest(req)
          if (remote) {
            headInsert += '<script>window.PATCHBAY_REMOTE = ' +
              JSON.stringify(remote) +
              ';</script>'
          }

          if (headInsert)
            html = html.replace('</head>', headInsert + '</head>')

          res.writeHead(200, {'Content-Type': getContentType(resolvedPath)})
          res.end(html)
        })
      }

      res.writeHead(200, {'Content-Type': getContentType(resolvedPath)})

      if (req.method === 'HEAD') {
        res.end()
        return
      }

      fs.createReadStream(resolvedPath).pipe(res)
    }

    fs.stat(filePath, function (err, stat) {
      if (err || !stat || !stat.isFile()) {
        if (relPath === 'style.css') {
          var fallbackPath = path.join(__dirname, '..', 'decent', 'style.css')
          return fs.stat(fallbackPath, function (fallbackErr, fallbackStat) {
            if (fallbackErr || !fallbackStat || !fallbackStat.isFile()) {
              respondNotFound(res)
              return
            }
            serveFile(fallbackPath)
          })
        }
        respondNotFound(res)
        return
      }

      serveFile(filePath)
    })
  }

  var server = http.createServer(serveStatic)
  var startUrl = null

  server.on('error', function (err) {
    console.error('decent-ui server error:', err.message || err)
  })

  server.listen(port, host, function () {
    var addr = server.address()
    var listeningPort = addr && addr.port ? addr.port : port
    startUrl = 'http://' + host + ':' + listeningPort + '/'
    console.log('Decent launched at ' + startUrl)
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
    decent: {
      port: port,
      host: host
    }
  }
}
