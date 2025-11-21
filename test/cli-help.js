var fs = require('fs')
var os = require('os')
var path = require('path')
var spawn = require('child_process').spawn
var test = require('tape')

function runHelpCommand (args, callback) {
  var tmpFile = path.join(os.tmpdir(), 'ssb-help-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.txt')
  var outFd
  try {
    outFd = fs.openSync(tmpFile, 'w')
  } catch (err) {
    return callback(err)
  }

  var child = spawn(process.execPath, [path.join(__dirname, '..', 'bin')].concat(args), {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', outFd, 'ignore']
  })

  function cleanup () {
    if (outFd != null) {
      try { fs.closeSync(outFd) } catch (err) {}
      outFd = null
    }
  }

  child.on('error', function (err) {
    cleanup()
    try { fs.unlinkSync(tmpFile) } catch (err) {}
    callback(err)
  })

  child.on('close', function (code) {
    cleanup()
    var stdout = ''
    try {
      stdout = fs.readFileSync(tmpFile, 'utf8')
    } catch (err) {
      return callback(err)
    } finally {
      try { fs.unlinkSync(tmpFile) } catch (_) {}
    }
    callback(null, code, stdout)
  })
}

test('general help keeps the list short', function (t) {
  t.plan(3)
  runHelpCommand(['help'], function (err, code, stdout) {
    t.error(err, 'help command runs without error')
    t.equal(code, 0, 'help command exits cleanly')
    t.ok(/Top-level commands/.test(stdout), 'prints a concise top-level summary')
  })
})

test('command help prints args and example', function (t) {
  t.plan(4)
  runHelpCommand(['help', 'friends.hops'], function (err, code, stdout) {
    t.error(err, 'command help runs without error')
    t.equal(code, 0, 'command help exits cleanly')
    t.ok(/dump the map of hops/.test(stdout), 'shows the friends.hops description')
    t.ok(/Example: ssb-server friends\.hops/.test(stdout), 'prints an example invocation')
  })
})

test('list-commands prints every RPC name', function (t) {
  t.plan(3)
  runHelpCommand(['list-commands'], function (err, code, stdout) {
    t.error(err, 'list-commands runs without error')
    t.equal(code, 0, 'list-commands exits cleanly')
    t.ok(/friends\.hops/.test(stdout), 'includes friends.hops in the list')
  })
})
