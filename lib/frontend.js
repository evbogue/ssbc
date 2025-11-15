var fs = require('fs')
var path = require('path')
var pull = require('pull-stream')

exports.name = 'frontend'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  if (!sbot.ws || typeof sbot.ws.use !== 'function')
    return {}

  var publicDir = path.join(__dirname, '..', 'public')

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

    if (req.method !== 'GET' && req.method !== 'HEAD') return next()

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

    var filePath = path.join(publicDir, url.replace(/^\/+/, ''))

    if (filePath.indexOf(publicDir) !== 0) return next()

    fs.stat(filePath, function (err, stat) {
      if (err || !stat.isFile()) return next()

      var ext = path.extname(filePath)
      var contentType = 'text/plain'
      if (ext === '.html') contentType = 'text/html; charset=utf-8'
      else if (ext === '.js') contentType = 'application/javascript; charset=utf-8'
      else if (ext === '.css') contentType = 'text/css; charset=utf-8'
      else if (ext === '.json') contentType = 'application/json; charset=utf-8'

      res.writeHead(200, {'Content-Type': contentType})
      fs.createReadStream(filePath).pipe(res)
    })
  })

  return {}
}
