'use strict'

const fs     = require('fs')
const os     = require('os')
const test   = require('tape')
const { spawn, exec } = require('child_process')
const crypto = require('crypto')
const net    = require('net')
const { join } = require('path')
const ma     = require('multiserver-address')

// travis currently does not support ipv6, because GCE does not.
const has_ipv6 = process.env.TRAVIS === undefined
const children = []

process.on('exit', () => children.forEach((e) => e.kill('SIGKILL')))
process.on('SIGINT', () => { children.forEach((e) => e.kill('SIGKILL')); process.exit(1) })

let exited = false
let count  = 0

function ssbServer(t, argv, opts) {
  count++
  exited = false
  opts = opts || {}
  argv = argv.slice()

  if (!argv.some((arg) => /^--decent\.port(?:=|$)/.test(arg)) &&
      !argv.some((arg) => /^--ws\.port(?:=|$)/.test(arg)))
    argv.push('--decent.port=0')

  const home = fs.mkdtempSync(join(os.tmpdir(), 'ssb-server-home-'))

  const sh = spawn(
    process.execPath,
    [join(__dirname, '../bin.js')].concat(argv),
    Object.assign({
      env: Object.assign({}, process.env, {
        HOME: home,
        ssb_appname: 'test'
      })
    }, opts)
  )

  sh.once('exit', (code, name) => {
    exited = true
    t.equal(name, 'SIGKILL')
    if (--count) return
    t.end()
  })

  sh.stdout.pipe(process.stdout)
  sh.stderr.pipe(process.stderr)
  children.push(sh)

  return function end() {
    while (children.length) children.shift().kill('SIGKILL')
  }
}

function try_often(times, opts, work, done) {
  if (typeof opts === 'function') { done = work; work = opts; opts = {} }
  const delay = 2000
  setTimeout(() => {
    console.log('try more:', times)
    work((err, result) => {
      if (!err) return done(null, result)
      if (opts.ignore && err.message && !err.message.match(opts.ignore)) {
        console.error('Fatal error:', err)
        return done(err)
      }
      if (!times) return done(err)
      if (exited) return done(new Error('already exited'))
      console.warn('retry run', times)
      console.error('work(err):', err)
      try_often(times - 1, work, done)
    })
  }, delay)
}

function connect(port, host, cb) {
  let done   = false
  const socket = net.connect(port, host)
  socket.on('error', (err) => { if (!done) { done = true; cb(err) } })
  socket.on('connect', () => { if (!done) { done = true; cb(null) } })
}

function testSsbServer(t, opts, asConfig, port, cb) {
  const dir = '/tmp/ssb-server_binjstest_' + Date.now()
  if (typeof port === 'function') { cb = port; port = opts.port }
  fs.mkdirSync(dir, { recursive: true })

  const args = ['start', '--path ' + dir]

  if (asConfig) {
    fs.writeFileSync(join(dir, '.testrc'), JSON.stringify(opts))
  } else {
    ;(function toArgs(prefix, opts) {
      for (const k in opts) {
        if (opts[k] && typeof opts[k] === 'object')
          toArgs(prefix + k + '.', opts[k])
        else
          args.push(prefix + k + '=' + opts[k])
      }
    })('--', opts)
  }

  const end = ssbServer(t, args, { cwd: dir })

  try_often(10, { ignore: /ECONNREFUSED/ }, (cb) => {
    connect(port, opts.host, cb)
  }, (err) => {
    cb(err)
    end()
  })
}

;['::1', '::', '127.0.0.1', 'localhost'].forEach((host) => {
  if (!has_ipv6 && /:/.test(host)) return

  ;[9002, 9001].forEach((sbotPort) => {
    ;[true, false].forEach((asConfig) => {
      const opts = { host, port: sbotPort, ws: { port: 9033 } }
      test('run bin.js server with ' +
        (asConfig ? 'a config file' : 'command line options') +
        ':' + JSON.stringify(opts) + ' then connect to port:' + sbotPort,
      (t) => {
        testSsbServer(t, opts, true, (err) => {
          t.error(err, 'Successfully connect eventually')
        })
      })
    })
  })
})

test('ssbServer should have websockets and http server by default', (t) => {
  const p    = '/tmp/ssbServer_binjstest_' + Date.now()
  const caps = crypto.randomBytes(32).toString('base64')
  const end  = ssbServer(t, [
    'start',
    '--host=127.0.0.1',
    '--port=9001',
    '--ws.port=9002',
    '--path', p,
    '--caps.shs', caps
  ])

  try_often(10, (cb) => {
    exec([
      join(__dirname, '../bin.js'),
      'address',
      'device',
      '--',
      '--host=127.0.0.1',
      '--port=9001',
      '--path', p,
      '--caps.shs', caps
    ].join(' '), {
      env: Object.assign({}, process.env, { ssb_appname: 'test' })
    }, (err, stdout) => {
      if (err) return cb(err)
      cb(null, JSON.parse(stdout))
    })
  }, (err, addr) => {
    t.error(err, 'ssbServer getAddress succeeds eventually')
    if (err) return end()
    t.ok(addr, 'address is not null')
    t.comment('result of ssb-server address: ' + addr)

    const remotes = ma.decode(addr)
    console.log('remotes', remotes, addr)
    const ws_remotes = remotes.filter((a) => a.find((c) => c.name === 'ws'))
    t.equal(ws_remotes.length, 1, 'has one ws remote')
    const remote = ma.encode([ws_remotes[0]])
    t.ok(remote.indexOf('9002') > 0, 'ws address contains expected port')

    const key = require('ssb-keys').loadOrCreateSync(join(p, 'secret'))
    require('ssb-client')(key, {
      path: p,
      caps: { shs: caps },
      remote
    }, (err, ssb) => {
      t.error(err, 'ssb-client returns no error')
      t.ok(ssb.manifest, 'got manifest from api')
      t.ok(ssb.version, 'got version from api')
      ssb.whoami((err, feed) => {
        t.error(err, 'ssb.whoami succeeds')
        t.equal(feed.id[0], '@', 'feed.id has @ sigil')
        end()
      })
    })
  })
})

test('decent and websockets share one internal port', (t) => {
  const p    = '/tmp/ssbServer_shared_port_' + Date.now()
  const caps = crypto.randomBytes(32).toString('base64')
  const end  = ssbServer(t, [
    'start',
    '--host=127.0.0.1',
    '--port=9001',
    '--ws.port=9002',
    '--path', p,
    '--caps.shs', caps
  ])

  try_often(10, (cb) => {
    exec([
      join(__dirname, '../bin.js'),
      'address',
      'device',
      '--',
      '--host=127.0.0.1',
      '--port=9001',
      '--ws.port=9002',
      '--path', p,
      '--caps.shs', caps
    ].join(' '), {
      env: Object.assign({}, process.env, { ssb_appname: 'test' })
    }, (err, stdout) => {
      if (err) return cb(err)
      cb(null, JSON.parse(stdout))
    })
  }, (err, addr) => {
    t.error(err, 'ssb-server public address succeeds eventually')
    if (err) return end()

    const remotes = ma.decode(addr)
    const ws_remotes = remotes.filter((a) => a.find((c) => c.name === 'ws'))
    t.equal(ws_remotes.length, 1, 'has one ws remote')

    const remote = ma.encode([ws_remotes[0]])
    t.ok(remote.indexOf('9002') > 0, 'ws address uses the shared http port')

    connect(9002, '127.0.0.1', (connectErr) => {
      t.error(connectErr, 'shared decent/ws port is listening')
      end()
    })
  })
})

test('ssb-server client should work without options', (t) => {
  const p = '/tmp/ssb-server_binjstest_' + Date.now()
  fs.mkdirSync(p, { recursive: true })
  fs.writeFileSync(p + '/config', JSON.stringify({ port: 43293, ws: { port: 43294 } }))

  const caps = crypto.randomBytes(32).toString('base64')
  const end  = ssbServer(t, [
    'start',
    '--path', p,
    '--config', p + '/config',
    '--caps.shs', caps
  ])

  try_often(10, (cb) => {
    exec([
      join(__dirname, '../bin.js'),
      'address',
      'device',
      '--path', p,
      '--config', p + '/config',
      '--caps.shs', caps
    ].join(' '), {
      env: Object.assign({}, process.env, { ssb_appname: 'test' })
    }, (err, stdout) => {
      if (err) return cb(err)
      cb(null, JSON.parse(stdout))
    })
  }, (err, addr) => {
    t.error(err, 'ssb-server address succeeds eventually')
    if (err) return end()
    t.ok(addr)
    t.comment('result of ssb-server address: ' + addr)
    end()
  })
})

test('second start against the same app dir fails before plugin init', (t) => {
  const dir = '/tmp/ssb-server-locktest_' + Date.now()
  fs.mkdirSync(dir, { recursive: true })

  const first = spawn(process.execPath, [
    join(__dirname, '../bin.js'),
    'start',
    '--host=127.0.0.1',
    '--port=0',
    '--decent.port=0',
    '--path', dir
  ], {
    env: Object.assign({}, process.env, { ssb_appname: 'test' })
  })

  children.push(first)
  first.stdout.pipe(process.stdout)
  first.stderr.pipe(process.stderr)

  let started = false
  let launchBuffer = ''

  function finish(err) {
    first.kill('SIGKILL')
    if (err) t.fail(err.message || String(err))
    t.end()
  }

  first.stdout.on('data', (chunk) => {
    launchBuffer += chunk.toString()
    if (launchBuffer.indexOf('Decent launched at ') === -1 || started) return
    started = true

    const second = spawn(process.execPath, [
      join(__dirname, '../bin.js'),
      'start',
      '--host=127.0.0.1',
      '--port=0',
      '--decent.port=0',
      '--path', dir
    ], {
      env: Object.assign({}, process.env, { ssb_appname: 'test' })
    })

    let stderr = ''
    second.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    second.on('exit', (code) => {
      t.equal(code, 1, 'second process exits with error')
      t.ok(/another ssbc process is already using/.test(stderr), 'second process reports app-dir lock clearly')
      finish()
    })
  })

  first.on('exit', () => {
    if (!started) finish(new Error('first process exited before lock test ran'))
  })
})
