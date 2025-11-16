var fs = require('fs')
var path = require('path')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')

exports.name = 'frontend'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  if (!sbot.ws || typeof sbot.ws.use !== 'function')
    return {}

  var publicDir = path.join(__dirname, '..', 'public')
  var patchbayDir = path.join(__dirname, '..', 'patchbay')
  var patchbayIndex = path.join(patchbayDir, 'build', 'index.html')
  var hasPatchbay = fs.existsSync(patchbayIndex)

  function serveFile (res, filePath) {
    var ext = path.extname(filePath)
    var contentType = 'text/plain'
    if (ext === '.html') contentType = 'text/html; charset=utf-8'
    else if (ext === '.js') contentType = 'application/javascript; charset=utf-8'
    else if (ext === '.css') contentType = 'text/css; charset=utf-8'
    else if (ext === '.json') contentType = 'application/json; charset=utf-8'

    res.writeHead(200, {'Content-Type': contentType})
    fs.createReadStream(filePath).pipe(res)
  }

  sbot.ws.use(function (req, res, next) {
    var url = req.url.split('?')[0]

    if (req.method === 'POST' && url === '/publish') {
      if (!sbot.add)
        return next()

      var body = ''
      req.on('data', function (data) {
        body += data
        if (body.length > 1e6)
          req.connection.destroy()
      })
      req.on('end', function () {
        var data
        try { data = JSON.parse(body) }
        catch (e) {
          res.writeHead(400, {'Content-Type': 'application/json'})
          return res.end(JSON.stringify({error: 'invalid json'}))
        }

        var msg = data && data.msg
        if (!msg || typeof msg !== 'object') {
          res.writeHead(400, {'Content-Type': 'application/json'})
          return res.end(JSON.stringify({error: 'missing msg'}))
        }

        sbot.add(msg, function (err, saved) {
          if (err) {
            res.writeHead(500, {'Content-Type': 'application/json'})
            return res.end(JSON.stringify({error: err.message}))
          }
          res.writeHead(200, {'Content-Type': 'application/json'})
          res.end(JSON.stringify(saved, null, 2))
        })
      })
      return
    }

    if (req.method === 'POST' && url === '/blobs/add' && sbot.blobs && typeof sbot.blobs.add === 'function') {
      return pull(
        toPull.source(req),
        sbot.blobs.add(function (err, hash) {
          if (err) {
            res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'})
            return res.end(err.message)
          }
          res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'})
          res.end(hash)
        })
      )
    }

    if (req.method === 'GET' && url.indexOf('/blobs/get/') === 0 && sbot.blobs && typeof sbot.blobs.get === 'function') {
      var hash = decodeURIComponent(url.substring('/blobs/get/'.length))

      return sbot.blobs.has(hash, function (err, has) {
        if (err || !has) {
          res.writeHead(404, {'Content-Type': 'application/json'})
          return res.end(JSON.stringify({error: 'blob not found', id: hash}))
        }

        res.writeHead(200, {'Content-Type': 'application/octet-stream'})
        pull(
          sbot.blobs.get({key: hash}),
          toPull.sink(res)
        )
      })
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return next()

    if ((url === '/' || url === '/index.html') && hasPatchbay) {
      var host = req.headers && req.headers.host
      var remote = null

      if (host && sbot.id && typeof sbot.id === 'string') {
        var i = sbot.id.indexOf('.')
        var key = i === -1 ? sbot.id.substring(1) : sbot.id.substring(1, i)

        var proto = 'http'
        if (req.connection && req.connection.encrypted)
          proto = 'https'
        else if (req.headers && typeof req.headers['x-forwarded-proto'] === 'string')
          proto = req.headers['x-forwarded-proto'].split(',')[0].trim()

        var wsProto = proto === 'https' ? 'wss' : 'ws'

        remote = wsProto + '://' + host + '~shs:' + key
      }

      return fs.readFile(patchbayIndex, 'utf8', function (err, html) {
        if (err) return next(err)

        if (remote) {
          var script = '<script>window.PATCHBAY_REMOTE = ' +
            JSON.stringify(remote) +
            ';</script>'
          html = html.replace('</head>', script + '</head>')
        }

        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
        res.end(html)
      })
    }

    if (url === '/log.json') {
      if (!sbot.createLogStream)
        return next()

      res.writeHead(200, {'Content-Type': 'application/json'})
      return pull(
        sbot.createLogStream({ limit: 100, reverse: true }),
        pull.collect(function (err, msgs) {
          if (err) {
            res.statusCode = 500
            return res.end(JSON.stringify({ error: err.message }))
          }
          res.end(JSON.stringify(msgs, null, 2))
        })
      )
    }

    if (url === '/') url = '/index.html'

    var relPath = url.replace(/^\/+/, '')
    var filePath = path.join(publicDir, relPath)
    var patchbayPath = path.join(patchbayDir, relPath)

    if (filePath.indexOf(publicDir) !== 0 || relPath.indexOf('..') !== -1)
      filePath = null
    if (patchbayPath.indexOf(patchbayDir) !== 0 || relPath.indexOf('..') !== -1)
      patchbayPath = null

    fs.stat(filePath || patchbayPath, function (err, stat) {
      if (!err && stat && stat.isFile() && filePath) return serveFile(res, filePath)

      if (!patchbayPath) return next()

      fs.stat(patchbayPath, function (err2, stat2) {
        if (err2 || !stat2 || !stat2.isFile()) return next()
        serveFile(res, patchbayPath)
      })
    })
  })

  return {}
}
