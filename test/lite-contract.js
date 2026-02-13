var test = require('tape')
var crypto = require('crypto')
var net = require('net')
var http = require('http')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var spawn = require('child_process').spawn
var exec = require('child_process').exec
var join = require('path').join
var mkdirp = require('mkdirp')

// Minimal contract test for Patchbay Lite / Decent.
// Verifies:
// - muxrpc whoami works via ssb-client
// - HTTP POST /blobs/add returns a hash
// - HTTP GET /blobs/get/:hash round-trips bytes
// - optionally: query.read or links2.read is callable

var children = []
process.on('exit', function () {
  children.forEach(function (e) {
    try { e.kill('SIGKILL') } catch (_) {}
  })
})
process.on('SIGINT', function () {
  children.forEach(function (e) {
    try { e.kill('SIGKILL') } catch (_) {}
  })
  process.exit(1)
})

function getFreePort (cb) {
  var s = net.createServer()
  s.listen(0, '127.0.0.1', function () {
    var port = s.address().port
    s.close(function () { cb(null, port) })
  })
  s.on('error', cb)
}

function httpRequest (opts, body, cb) {
  var req = http.request(opts, function (res) {
    var chunks = []
    res.on('data', function (c) { chunks.push(c) })
    res.on('end', function () {
      cb(null, {
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      })
    })
  })
  req.on('error', cb)
  if (body) req.end(body)
  else req.end()
}

function ssbServer (t, argv, opts) {
  opts = opts || {}

  var sh = spawn(
    process.execPath,
    [join(__dirname, '../bin.js')].concat(argv),
    Object.assign({
      env: Object.assign({}, process.env, { ssb_appname: 'test' })
    }, opts)
  )

  sh.stdout.pipe(process.stdout)
  sh.stderr.pipe(process.stderr)

  children.push(sh)

  var ended = false
  return function end () {
    if (ended) return
    ended = true
    while (children.length) {
      try { children.shift().kill('SIGKILL') } catch (_) {}
    }
    t.end()
  }
}

function waitForWsAddress (path, caps, sbotPort, wsPort, cb) {
  exec([
    join(__dirname, '../bin.js'),
    'address',
    'device',
    '--',
    '--host=127.0.0.1',
    '--port=' + sbotPort,
    '--ws.host=127.0.0.1',
    '--ws.port=' + wsPort,
    '--path', path,
    '--caps.shs', caps
  ].join(' '), {
    env: Object.assign({}, process.env, { ssb_appname: 'test' })
  }, function (err, stdout) {
    if (err) return cb(err)
    try {
      cb(null, JSON.parse(stdout))
    } catch (e) {
      cb(e)
    }
  })
}

function tryOften (times, work, done) {
  var delay = 750
  setTimeout(function () {
    work(function (err, result) {
      if (!err) return done(null, result)
      if (!times) return done(err)
      tryOften(times - 1, work, done)
    })
  }, delay)
}

function maybeCallReadStream (t, ssb, cb) {
  var fn = null
  if (ssb.query && typeof ssb.query.read === 'function') fn = ssb.query.read
  else if (ssb.links2 && typeof ssb.links2.read === 'function') fn = ssb.links2.read

  if (!fn) {
    t.comment('query.read / links2.read not present; skipping optional check')
    return cb()
  }

  var timedOut = false
  var timer = setTimeout(function () {
    timedOut = true
    t.fail('optional read stream timed out')
    cb()
  }, 2000)

  // call with a tiny limit so it can complete quickly even on empty db
  var source = fn({ limit: 1 })
  pull(
    source,
    pull.take(1),
    pull.collect(function (err, items) {
      clearTimeout(timer)
      if (timedOut) return
      // err is allowed here depending on plugin presence/behavior, but the call should be valid.
      if (err) t.comment('optional read stream returned err: ' + err.message)
      else t.pass('optional read stream callable (' + (items ? items.length : 0) + ' items)')
      cb()
    })
  )
}

test('lite client contract: whoami + http blobs add/get', function (t) {
  getFreePort(function (err, sbotPort) {
    if (err) return t.fail(err)
    getFreePort(function (err2, wsPort) {
      if (err2) return t.fail(err2)

      var path = '/tmp/ssbc_lite_contract_' + Date.now() + '_' + Math.random().toString(16).slice(2)
      mkdirp.sync(path)

      var caps = crypto.randomBytes(32).toString('base64')

      var end = ssbServer(t, [
        'start',
        '--host=127.0.0.1',
        '--port=' + sbotPort,
        '--ws.host=127.0.0.1',
        '--ws.port=' + wsPort,
        '--path', path,
        '--caps.shs', caps
      ], { cwd: path })

      // Discover the ws multiserver address using our own CLI (mirrors bin.js tests).
      tryOften(12, function (cb) {
        waitForWsAddress(path, caps, sbotPort, wsPort, cb)
      }, function (err3, addr) {
        t.error(err3, 'sbot address discovery works')
        if (err3) return end()

        var ma = require('multiserver-address')
        var remotes = ma.decode(addr)
        var wsRemotes = remotes.filter(function (a) {
          return a.find(function (component) {
            return component.name === 'ws'
          })
        })
        t.equal(wsRemotes.length, 1, 'has one ws remote')

        var remote = ma.encode([wsRemotes[0]])

        var key = require('ssb-keys').loadOrCreateSync(join(path, 'secret'))
        require('ssb-client')(key, {
          path: path,
          caps: { shs: caps },
          remote: remote
        }, function (err4, ssb) {
          t.error(err4, 'ssb-client connects')
          if (err4) return end()

          ssb.whoami(function (err5, feed) {
            t.error(err5, 'whoami works')
            t.ok(feed && feed.id && feed.id[0] === '@', 'whoami returns feed id')

            maybeCallReadStream(t, ssb, function () {
              // HTTP blob endpoints are served by lib/frontend.js on the ws port.
              var bytes = crypto.randomBytes(64)
              httpRequest({
                method: 'POST',
                host: '127.0.0.1',
                port: wsPort,
                path: '/blobs/add',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'Content-Length': bytes.length
                }
              }, bytes, function (err6, res1) {
                t.error(err6, 'POST /blobs/add')
                if (err6) return end()
                t.equal(res1.statusCode, 200, 'POST /blobs/add status 200')

                var hash = res1.body.toString('utf8').trim()
                t.ok(hash && hash[0] === '&', 'received blob hash')

                httpRequest({
                  method: 'GET',
                  host: '127.0.0.1',
                  port: wsPort,
                  path: '/blobs/get/' + encodeURIComponent(hash)
                }, null, function (err7, res2) {
                  t.error(err7, 'GET /blobs/get/:hash')
                  if (err7) return end()
                  t.equal(res2.statusCode, 200, 'GET /blobs/get status 200')
                  t.deepEqual(res2.body, bytes, 'blob bytes round-trip')

                  // Close client, then server.
                  try {
                    if (ssb && typeof ssb.close === 'function') ssb.close()
                  } catch (_) {}
                  end()
                })
              })
            })
          })
        })
      })
    })
  })
})
