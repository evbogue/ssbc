'use strict'

var http = require('http')
var URL = require('url').URL
var pull = require('pull-stream')

exports.name = 'rest-bridge'
exports.version = '1.0.0'
exports.manifest = {}

function parseIntParam (value, fallback) {
  var num = parseInt(value, 10)
  return Number.isFinite(num) && num >= 0 ? num : fallback
}

function setCors (res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}

function sendJson (res, status, payload) {
  setCors(res)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function sendNotFound (res) {
  sendJson(res, 404, {error: 'not found'})
}

function readJsonBody (req, cb) {
  var limit = 2 * 1024 * 1024
  var data = ''
  var done = false

  function finish (err, value) {
    if (done) return
    done = true
    cb(err, value)
  }

  req.on('data', function (chunk) {
    if (done) return
    data += chunk
    if (data.length > limit) {
      req.destroy()
      finish(new Error('request entity too large'))
    }
  })

  req.on('error', function (err) {
    finish(err)
  })

  req.on('end', function () {
    if (done) return
    if (!data) return finish(null, null)
    try {
      finish(null, JSON.parse(data))
    } catch (err) {
      finish(err)
    }
  })
}

exports.init = function (sbot, config) {
  var restConfig = config.restBridge || {}
  if (restConfig.enabled === false) return {}

  var listenHost = restConfig.host || '0.0.0.0'
  var listenPort = restConfig.port || 8927

  function respondStatus (res) {
    var status = null
    if (typeof sbot.status === 'function') {
      try { status = sbot.status() }
      catch (err) { status = {error: err.message} }
    }

    var body = {
      message: 'ssb rest bridge',
      id: sbot.id,
      public: config.keys && config.keys.public,
      curve: config.keys && config.keys.curve,
      host: config.host || 'localhost',
      port: config.port,
      rest: {host: listenHost, port: listenPort}
    }
    if (status) body.status = status
    sendJson(res, 200, body)
  }

  function respondFeed (res, searchParams) {
    if (typeof sbot.createLogStream !== 'function') {
      return sendJson(res, 503, {error: 'log stream unavailable'})
    }

    var limit = parseIntParam(searchParams.get('limit'), 100)
    var reverse = searchParams.get('reverse') !== 'false'
    var opts = {limit: limit, reverse: reverse}

    pull(
      sbot.createLogStream(opts),
      pull.collect(function (err, msgs) {
        if (err) return sendJson(res, 500, {error: err.message})
        sendJson(res, 200, msgs)
      })
    )
  }

  function respondAuthorFeed (res, author, searchParams) {
    if (typeof sbot.createHistoryStream !== 'function') {
      return sendJson(res, 503, {error: 'history stream unavailable'})
    }
    var since = parseIntParam(searchParams.get('since'), 0)
    var limit = parseIntParam(searchParams.get('limit'), -1)
    var opts = {
      id: author,
      seq: since > 0 ? since + 1 : 1,
      live: false,
      keys: true,
      values: true
    }
    if (limit >= 0) opts.limit = limit

    pull(
      sbot.createHistoryStream(opts),
      pull.collect(function (err, msgs) {
        if (err) return sendJson(res, 500, {error: err.message})
        sendJson(res, 200, msgs)
      })
    )
  }

  function handlePublish (req, res) {
    readJsonBody(req, function (err, payload) {
      if (err) return sendJson(res, 400, {error: err.message})
      if (!payload || typeof payload !== 'object') {
        return sendJson(res, 400, {error: 'payload must be an object'})
      }
      if (payload.content && typeof payload.content === 'object') {
        if (typeof sbot.publish !== 'function') {
          return sendJson(res, 503, {error: 'publish unavailable'})
        }
        return sbot.publish(payload.content, function (err2, msg) {
          if (err2) return sendJson(res, 500, {error: err2.message})
          sendJson(res, 200, msg)
        })
      }
      if (payload.msg && typeof payload.msg === 'object') {
        if (typeof sbot.add !== 'function') {
          return sendJson(res, 503, {error: 'add unavailable'})
        }
        return sbot.add(payload.msg, function (err3, msg) {
          if (err3) return sendJson(res, 500, {error: err3.message})
          sendJson(res, 200, msg)
        })
      }
      sendJson(res, 400, {error: 'payload must include content or msg'})
    })
  }

  function handleFeedAppend (req, res) {
    if (typeof sbot.add !== 'function') {
      return sendJson(res, 503, {error: 'add unavailable'})
    }
    readJsonBody(req, function (err, payload) {
      if (err) return sendJson(res, 400, {error: err.message})
      if (!payload || typeof payload !== 'object' || typeof payload.msg !== 'object') {
        return sendJson(res, 400, {error: 'missing msg'})
      }
      sbot.add(payload.msg, function (err2, msg) {
        if (err2) return sendJson(res, 500, {error: err2.message})
        sendJson(res, 200, msg)
      })
    })
  }

  function respondLog (res) {
    if (typeof sbot.createLogStream !== 'function') {
      return sendJson(res, 503, {error: 'log stream unavailable'})
    }
    pull(
      sbot.createLogStream({limit: 100, reverse: true}),
      pull.collect(function (err, msgs) {
        if (err) return sendJson(res, 500, {error: err.message})
        sendJson(res, 200, msgs)
      })
    )
  }

  function handleRequest (req, res) {
    var method = (req.method || 'GET').toUpperCase()
    var parsedUrl = new URL(req.url, 'http://localhost')
    var pathname = parsedUrl.pathname

    if (method === 'OPTIONS') {
      setCors(res)
      res.writeHead(204)
      return res.end()
    }

    if (method === 'GET' && pathname === '/status') {
      return respondStatus(res)
    }

    if (method === 'GET' && pathname === '/feed') {
      return respondFeed(res, parsedUrl.searchParams)
    }

    if (method === 'GET' && pathname === '/log.json') {
      return respondLog(res)
    }

    if (method === 'POST' && pathname === '/publish') {
      return handlePublish(req, res)
    }

    if (pathname.indexOf('/feeds/') === 0) {
      var author = decodeURIComponent(pathname.substring('/feeds/'.length))
      if (!author) return sendJson(res, 400, {error: 'missing author'})
      if (method === 'GET') {
        return respondAuthorFeed(res, author, parsedUrl.searchParams)
      }
      if (method === 'POST') {
        return handleFeedAppend(req, res)
      }
    }

    if (method === 'GET' && pathname === '/') {
      return sendJson(res, 200, {
        message: 'ssb rest bridge',
        endpoints: ['/status', '/feed', '/log.json', '/feeds/:id', '/publish (POST)', '/feeds/:id (POST)']
      })
    }

    return sendNotFound(res)
  }

  var server = http.createServer(handleRequest)
  server.listen(listenPort, listenHost, function () {
    if (typeof sbot.emit === 'function') {
      sbot.emit('log:info', ['rest-bridge', 'listen', listenHost + ':' + listenPort])
    } else {
      console.log('[rest-bridge] listening on %s:%s', listenHost, listenPort)
    }
  })

  if (sbot.close && typeof sbot.close.hook === 'function') {
    sbot.close.hook(function (fn, args) {
      server.close()
      return fn.apply(this, args)
    })
  }

  return {
    address: function () {
      return {host: listenHost, port: listenPort}
    }
  }
}
