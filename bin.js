#! /usr/bin/env node

process.env.CHLORIDE_JS = process.env.CHLORIDE_JS || '1'

var fs           = require('fs')
var path         = require('path')
var pull         = require('pull-stream')
var toPull       = require('stream-to-pull-stream')
var File         = require('pull-file')
var spawn        = require('cross-spawn')
var explain      = require('explain-error')
var minimist     = require('minimist')
var muxrpcli     = require('muxrpcli')
var cmdAliases   = require('./lib/cli-cmd-aliases')
var ProgressBar  = require('./lib/progress')
var cliHelp      = require('./lib/cli-help')
var homeDir      = require('os-homedir')
var packageJson  = require('./package.json')

//get config as cli options after --, options before that are
//options to the command.
var argv = process.argv.slice(2)
var i = argv.indexOf('--')
var conf = i === -1 ? [] : argv.slice(i+1)
argv = i === -1 ? argv : argv.slice(0, i)

var overrides = minimist(conf)
var envAppName = process.env.ssb_appname
var appName = envAppName || overrides.appname || overrides.ssb_appname || 'ssb'
var baseHome = homeDir() || 'browser'
var basePath = overrides.path || path.join(baseHome, '.' + appName)
var manifestForHelp = {}
var manifestPathForHelp = path.join(basePath, 'manifest.json')
if (fs.existsSync(manifestPathForHelp)) {
  try {
    manifestForHelp = JSON.parse(fs.readFileSync(manifestPathForHelp))
  } catch (err) {
    manifestForHelp = {}
  }
}
var helpCatalog = cliHelp.createCatalog(manifestForHelp)

var helpFlags = ['--help', '-h']

function printCliHelp () {
  var name = packageJson.name || 'ssb-server'
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
  console.log('Top-level commands (request detailed help for any of them):')
  var topLevelCommands = helpCatalog.names.filter(function (name) {
    return name.indexOf('.') === -1
  })
  var preview = topLevelCommands.slice(0, 12)
  console.log('  ' + preview.join(', '))
  if (topLevelCommands.length > preview.length) {
  console.log('  ...and ' + (topLevelCommands.length - preview.length) + ' more. Use `' + name + ' help <command>` to see specifics.')
  } else {
    console.log('  (Call `' + name + ' help <command>` for the detailed universe of commands.)')
  }
  console.log('  Call `' + name + ' list-commands` to dump every command name.')
  console.log('')
  console.log('Examples:')
  console.log('  ' + name + ' start')
  console.log('  ' + name + ' friends.hops alice')
  console.log('  ' + name + ' start -- --port 8008')
  console.log('')
  console.log('Run `' + name + ' help <command>` for more detail on a specific command.')
}

function printCommandHelp (requestedCommand) {
  var resolved = requestedCommand
  var entry = helpCatalog.get(resolved)
  if (!entry && cmdAliases[resolved]) {
    resolved = cmdAliases[resolved]
    entry = helpCatalog.get(resolved)
  }

  if (!entry) {
    console.log('No help data is currently available for `' + requestedCommand + '`.')
    console.log('Start the server to generate ' + manifestPathForHelp + ' and re-run `' + packageJson.name + ' help ' + requestedCommand + '`.')
    return
  }

  console.log('Help for `' + resolved + '`' + (resolved !== requestedCommand ? ' (matched from alias ' + requestedCommand + ')' : '') + ':')
  if (entry.description)
    console.log('  ' + entry.description)
  if (entry.type)
    console.log('Type: ' + entry.type)
  var argNames = Object.keys(entry.args || {})
  if (argNames.length) {
    console.log('Arguments:')
    argNames.forEach(function (argName) {
      var arg = entry.args[argName] || {}
      var type = arg.type || 'value'
      var desc = arg.description || ''
      console.log('  --' + argName + ' <' + type + '>' + (desc ? ' - ' + desc : ''))
    })
  }
  console.log('Example: ' + entry.example)
}

function printCommandList () {
  console.log('All available commands:')
  helpCatalog.names.forEach(function (name) {
    console.log('  ' + name)
  })
}

if (argv[0] === 'help') {
  if (argv[1])
    printCommandHelp(argv[1])
  else
    printCliHelp()
  process.exit(0)
}

if (argv[0] === 'list-commands') {
  printCommandList()
  process.exit(0)
}

if (argv.length === 0 || helpFlags.indexOf(argv[0]) !== -1) {
  printCliHelp()
  process.exit(0)
}

var Config = require('ssb-config/inject')
var config = Config(process.env.ssb_appname, overrides)

if (config.keys.curve === 'k256')
  throw new Error('k256 curves are no longer supported,'+
                  'please delete' + path.join(config.path, 'secret'))

var manifestFile = path.join(config.path, 'manifest.json')

if (argv[0] == 'server') {
  console.log('WARNING-DEPRECATION: `sbot server` has been renamed to `ssb-server start`')
  argv[0] = 'start'
}

if (argv[0] == 'start') {
  console.log(packageJson.name, packageJson.version, config.path, 'logging.level:'+config.logging.level)
  console.log('my key ID:', config.keys.public)

  // special start command:
  // import ssbServer and start the server

  var createSsbServer = require('./')
    .use(require('ssb-private1'))
    .use(require('ssb-onion'))
    .use(require('ssb-unix-socket'))
    .use(require('ssb-no-auth'))
    .use(require('ssb-plugins'))
    .use(require('ssb-master'))
    .use(require('ssb-gossip'))
    .use(require('ssb-replicate'))
    .use(require('./plugins/friends'))
    .use(require('ssb-blobs'))
    .use(require('./plugins/invite'))
    .use(require('./plugins/rest-bridge'))
    .use(require('./plugins/phoenix-ui'))
    .use(require('ssb-local'))
    .use(require('ssb-logging'))
    .use(require('ssb-query'))
    .use(require('ssb-links'))
    .use(require('ssb-ws'))
    .use(require('./lib/frontend'))
    .use(require('ssb-ebt'))
    .use(require('ssb-ooo'))
  // add third-party plugins

  require('ssb-plugins').loadUserPlugins(createSsbServer, config)

  // start server
  var server = createSsbServer(config)

  // write RPC manifest to ~/.ssb/manifest.json
  fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2))

  if(process.stdout.isTTY && (config.logging.level != 'info'))
    ProgressBar(server.progress)
} else {
  // normal command:
  // create a client connection to the server

  // read manifest.json
  var manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile))
  } catch (err) {
    throw explain(err,
      'no manifest file'
      + '- should be generated first time server is run'
    )
  }

  var opts = {
    manifest: manifest,
    port: config.port,
    host: config.host || 'localhost',
    caps: config.caps,
    key: config.key || config.keys.id
  }

  var Client = require('ssb-client')

  // connect
  Client(config.keys, opts, function (err, rpc) {
    if(err) {
      if (/could not connect/.test(err.message)) {
        console.error('Error: Could not connect to ssb-server ' + opts.host + ':' + opts.port)
        console.error('Use the "start" command to start it.')
        console.error('Use --verbose option to see full error')
        if(config.verbose) throw err
        process.exit(1)
      }
      throw err
    }

    // add aliases
    for (var k in cmdAliases) {
      rpc[k] = rpc[cmdAliases[k]]
      manifest[k] = manifest[cmdAliases[k]]
    }

    // add some extra commands
//    manifest.version = 'async'
    manifest.config = 'sync'
//    rpc.version = function (cb) {
//      console.log(packageJson.version)
//      cb()
//    }
    rpc.config = function (cb) {
      console.log(JSON.stringify(config, null, 2))
      cb()
    }

    if (process.argv[2] === 'blobs.add') {
      var filename = process.argv[3]
      var source =
        filename ? File(process.argv[3])
      : !process.stdin.isTTY ? toPull.source(process.stdin)
      : (function () {
        console.error('USAGE:')
        console.error('  blobs.add <filename> # add a file')
        console.error('  source | blobs.add   # read from stdin')
        process.exit(1)
      })()
      pull(
        source,
        rpc.blobs.add(function (err, hash) {
          if (err)
            throw err
          console.log(hash)
          process.exit()
        })
      )
      return
    }

    if (process.argv[2] === 'git-ssb') {
      var gitArgs = process.argv.slice(3)
      var gitPath
      try {
        gitPath = require.resolve('git-ssb/bin/git-ssb')
      } catch (e) {
        console.error('Error: vendored git-ssb not found in this ssb-server install.')
        console.error('Try running: npm install git-ssb --save')
        process.exit(1)
      }

      var child = spawn(process.execPath, [gitPath].concat(gitArgs), {stdio: 'inherit'})

      child.on('exit', function (code, signal) {
        if (typeof code === 'number')
          process.exit(code)
        else if (signal)
          process.exit(1)
        else
          process.exit(0)
      })
      return
    }

    // run commandline flow
    muxrpcli(argv, manifest, rpc, config.verbose)
  })
}
