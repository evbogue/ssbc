#! /usr/bin/env node
'use strict'

process.env.CHLORIDE_JS = process.env.CHLORIDE_JS || '1'

const fs            = require('fs')
const path          = require('path')
const os            = require('os')
const { spawn }     = require('child_process')
const pull          = require('pull-stream')
const muxrpcli      = require('muxrpcli')
const cmdAliases    = require('./lib/cli-cmd-aliases')
const ProgressBar   = require('./lib/progress')
const cliHelp       = require('./lib/cli-help')
const packageJson   = require('./package.json')

// Split process.argv at '--': args before are the command, args after are config overrides.
const allArgv  = process.argv.slice(2)
const splitAt  = allArgv.indexOf('--')
const conf     = splitAt === -1 ? [] : allArgv.slice(splitAt + 1)
let   argv     = splitAt === -1 ? allArgv : allArgv.slice(0, splitAt)

// Minimal inline argument parser for '--key value' / '--key=value' / '--flag' config overrides.
// Auto-casts numbers and booleans, matching minimist's default behaviour for ssb-config.
function parseConf(args) {
  const result = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    let key, val
    if (eq !== -1) {
      key = arg.slice(2, eq)
      val = arg.slice(eq + 1)
    } else {
      key = arg.slice(2)
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        val = next; i++
      } else {
        val = 'true'
      }
    }
    if (val === 'true')       val = true
    else if (val === 'false') val = false
    else if (val !== '' && !isNaN(val)) val = Number(val)
    // Expand dot-notation keys (e.g. 'caps.shs') into nested objects
    if (key.includes('.')) {
      const parts = key.split('.')
      let obj = result
      for (let j = 0; j < parts.length - 1; j++) {
        if (typeof obj[parts[j]] !== 'object' || !obj[parts[j]]) obj[parts[j]] = {}
        obj = obj[parts[j]]
      }
      obj[parts[parts.length - 1]] = val
    } else {
      result[key] = val
    }
  }
  return result
}

const overrides    = parseConf(conf)
const envAppName   = process.env.ssb_appname
const appName      = envAppName || overrides.appname || overrides.ssb_appname || 'ssb'
const baseHome     = os.homedir() || 'browser'
const basePath     = overrides.path || path.join(baseHome, '.' + appName)
const manifestPathForHelp = path.join(basePath, 'manifest.json')

let manifestForHelp = {}
if (fs.existsSync(manifestPathForHelp)) {
  try { manifestForHelp = JSON.parse(fs.readFileSync(manifestPathForHelp)) } catch (_) {}
}

const helpCatalog = cliHelp.createCatalog(manifestForHelp)
const helpFlags   = ['--help', '-h']
let appLockPath = null

function tryRemove(filePath) {
  try { fs.unlinkSync(filePath) } catch (_) {}
}

function isLivePid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (_) {
    return false
  }
}

function acquireAppLock(configPath) {
  fs.mkdirSync(configPath, { recursive: true })
  const lockPath = path.join(configPath, 'server.lock')

  function createLock() {
    const fd = fs.openSync(lockPath, 'wx')
    fs.writeFileSync(fd, String(process.pid))
    fs.closeSync(fd)
    return lockPath
  }

  try {
    return createLock()
  } catch (err) {
    if (!err || err.code !== 'EEXIST') throw err

    let existingPid = null
    try {
      existingPid = Number(String(fs.readFileSync(lockPath, 'utf8')).trim())
    } catch (_) {}

    if (isLivePid(existingPid)) {
      const msg = existingPid
        ? 'another ssbc process is already using ' + configPath + ' (pid ' + existingPid + ')'
        : 'another ssbc process is already using ' + configPath
      throw new Error(msg)
    }

    tryRemove(lockPath)
    return createLock()
  }
}

function releaseAppLock() {
  if (!appLockPath) return
  tryRemove(appLockPath)
  appLockPath = null
}

process.once('exit', releaseAppLock)
process.once('SIGINT', function () {
  releaseAppLock()
  process.exit(130)
})
process.once('SIGTERM', function () {
  releaseAppLock()
  process.exit(143)
})

function printCliHelp() {
  const name = packageJson.name || 'ssb-server'
  console.log(name + ' ' + packageJson.version)
  console.log('Usage:')
  console.log('  ' + name + ' start [--verbose]')
  console.log('  ' + name + ' <rpc.command> [arguments]')
  console.log('  ' + name + ' help [command]')
  console.log('')
  console.log('Options:')
  console.log('  --help, -h            show this message')
  console.log('  --verbose             show verbose RPC errors')
  console.log('  -- <key>=<value>      pass overrides to ssb-config')
  console.log('')
  console.log('Top-level commands:')
  const topLevel = helpCatalog.names.filter((n) => !n.includes('.'))
  const preview  = topLevel.slice(0, 12)
  console.log('  ' + preview.join(', '))
  if (topLevel.length > preview.length)
    console.log('  ...and ' + (topLevel.length - preview.length) + ' more. Use `' + name + ' help <command>` to see specifics.')
  else
    console.log('  (Call `' + name + ' help <command>` for the detailed universe of commands.)')
  console.log('  Call `' + name + ' list-commands` to dump every command name.')
  console.log('')
  console.log('Examples:')
  console.log('  ' + name + ' start')
  console.log('  ' + name + ' friends.hops alice')
  console.log('  ' + name + ' start -- --port 8008')
  console.log('')
  console.log('Run `' + name + ' help <command>` for more detail on a specific command.')
}

function printCommandHelp(requestedCommand) {
  let resolved = requestedCommand
  let entry    = helpCatalog.get(resolved)
  if (!entry && cmdAliases[resolved]) {
    resolved = cmdAliases[resolved]
    entry    = helpCatalog.get(resolved)
  }
  if (!entry) {
    console.log('No help data is currently available for `' + requestedCommand + '`.')
    console.log('Start the server to generate ' + manifestPathForHelp + ' and re-run `' + packageJson.name + ' help ' + requestedCommand + '`.')
    return
  }
  console.log('Help for `' + resolved + '`' + (resolved !== requestedCommand ? ' (matched from alias ' + requestedCommand + ')' : '') + ':')
  if (entry.description) console.log('  ' + entry.description)
  if (entry.type)        console.log('Type: ' + entry.type)
  const argNames = Object.keys(entry.args || {})
  if (argNames.length) {
    console.log('Arguments:')
    for (const argName of argNames) {
      const arg  = entry.args[argName] || {}
      const type = arg.type || 'value'
      const desc = arg.description || ''
      console.log('  --' + argName + ' <' + type + '>' + (desc ? ' - ' + desc : ''))
    }
  }
  console.log('Example: ' + entry.example)
}

function printCommandList() {
  console.log('All available commands:')
  for (const name of helpCatalog.names) console.log('  ' + name)
}

if (argv[0] === 'help') {
  if (argv[1]) printCommandHelp(argv[1])
  else         printCliHelp()
  process.exit(0)
}

if (argv[0] === 'list-commands') {
  printCommandList()
  process.exit(0)
}

if (argv.length === 0 || helpFlags.includes(argv[0])) {
  printCliHelp()
  process.exit(0)
}

const Config = require('ssb-config/inject')
// For the 'start' command, also parse any --key=value flags from argv (before
// the '--' separator) so that e.g. `ssb-server start --port=9001` works without
// requiring the -- convention.  Explicit post-'--' overrides take precedence.
const argvOverrides = argv[0] === 'start' || argv[0] === 'server'
  ? parseConf(argv.slice(1))
  : {}
const config = Config(process.env.ssb_appname, Object.assign(argvOverrides, overrides))

if (config.ws !== false) {
  if (!config.ws || typeof config.ws !== 'object') config.ws = {}
  if (typeof config.ws.port !== 'number') config.ws.port = 8989
  if (typeof config.ws.host !== 'string') config.ws.host = '127.0.0.1'
}

if (config.keys.curve === 'k256')
  throw new Error('k256 curves are no longer supported, please delete ' + path.join(config.path, 'secret'))

const manifestFile = path.join(config.path, 'manifest.json')

if (argv[0] === 'server') {
  console.log('WARNING-DEPRECATION: `sbot server` has been renamed to `ssb-server start`')
  argv = ['start', ...argv.slice(1)]
}

if (argv[0] === 'start') {
  appLockPath = acquireAppLock(config.path)
  console.log(packageJson.name, packageJson.version, config.path, 'logging.level:' + config.logging.level)
  console.log('my key ID:', config.keys.public)

  const createSsbServer = require('./')
    .use(require('ssb-private1'))
    .use(require('./lib/vendor/ssb-unix-socket'))
    .use(require('./lib/vendor/ssb-no-auth'))
    .use(require('ssb-plugins'))
    .use(require('./lib/vendor/ssb-master'))
    .use(require('ssb-gossip'))
    .use(require('./lib/vendor/ssb-replicate-stub'))
    .use(require('ssb-ebt'))
    .use(require('./plugins/friends'))
    .use(require('ssb-blobs'))
    .use(require('./plugins/invite'))
    .use(require('./plugins/git-server'))
    .use(require('./plugins/decent-ui'))
    .use(require('ssb-local'))
    .use(require('./lib/vendor/ssb-logging'))
    .use(require('ssb-query'))
    .use(require('ssb-links'))
    .use(require('ssb-ws'))
    .use(require('./lib/vendor/ssb-ooo-stub'))

  require('ssb-plugins').loadUserPlugins(createSsbServer, config)

  const server = createSsbServer(config)
  fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2))

  if (process.stdout.isTTY && config.logging.level !== 'info')
    ProgressBar(server.progress)

} else {
  // Client mode: connect to the running sbot and issue an RPC command.

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile))
  } catch (err) {
    throw new Error('no manifest file - should be generated first time server is run: ' + err.message)
  }

  const opts = {
    manifest,
    port: config.port,
    host: config.host || 'localhost',
    caps: config.caps,
    key:  config.key || config.keys.id
  }

  const Client = require('ssb-client')

  // blobs.add: pipe a file or stdin into the blob store
  if (argv[0] === 'blobs.add') {
    const filename = argv[1]

    // Convert a Node.js readable stream to a pull-stream source.
    function nodeStreamToPull(stream) {
      const queue = []
      let ended = null
      let waiting = null
      stream.on('data',  (chunk) => { if (waiting) { const cb = waiting; waiting = null; cb(null, chunk) } else { queue.push(chunk); stream.pause() } })
      stream.on('end',   ()      => { ended = true;  if (waiting) { const cb = waiting; waiting = null; cb(true) } })
      stream.on('error', (err)   => { ended = err;   if (waiting) { const cb = waiting; waiting = null; cb(err) } })
      return function read(end, cb) {
        if (end)         { if (stream.destroy) stream.destroy(); return cb(end) }
        if (queue.length) return cb(null, queue.shift())
        if (ended)        return cb(ended)
        waiting = cb; stream.resume()
      }
    }

    const source   = filename
      ? nodeStreamToPull(fs.createReadStream(filename))
      : !process.stdin.isTTY ? nodeStreamToPull(process.stdin)
      : (() => {
          console.error('USAGE:')
          console.error('  blobs.add <filename>  # add a file')
          console.error('  source | blobs.add    # read from stdin')
          process.exit(1)
        })()

    Client(config.keys, opts, (err, rpc) => {
      if (err) throw err
      pull(source, rpc.blobs.add((addErr, hash) => {
        if (addErr) throw addErr
        console.log(hash)
        process.exit()
      }))
    })
    return
  }

  // git-ssb passthrough
  if (argv[0] === 'git-ssb') {
    const gitArgs = argv.slice(1)
    let gitPath
    try {
      gitPath = require.resolve('git-ssb/bin/git-ssb')
    } catch (_) {
      console.error('Error: vendored git-ssb not found in this ssb-server install.')
      console.error('Try running: npm install git-ssb --save')
      process.exit(1)
    }
    const child = spawn(process.execPath, [gitPath, ...gitArgs], { stdio: 'inherit' })
    child.on('exit', (code, signal) => {
      process.exit(typeof code === 'number' ? code : signal ? 1 : 0)
    })
    return
  }

  // Normal RPC command
  Client(config.keys, opts, (err, rpc) => {
    if (err) {
      if (/could not connect/.test(err.message)) {
        console.error('Error: Could not connect to ssb-server ' + opts.host + ':' + opts.port)
        console.error('Use the "start" command to start it.')
        if (config.verbose) throw err
        process.exit(1)
      }
      throw err
    }

    // add aliases to rpc and manifest
    for (const k in cmdAliases) {
      rpc[k]      = rpc[cmdAliases[k]]
      manifest[k] = manifest[cmdAliases[k]]
    }

    manifest.config = 'sync'
    rpc.config = (cb) => {
      console.log(JSON.stringify(config, null, 2))
      cb()
    }

    muxrpcli(argv, manifest, rpc, config.verbose)
  })
}
