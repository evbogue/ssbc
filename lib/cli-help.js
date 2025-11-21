var fs = require('fs')
var path = require('path')

var manualEntries = {
  start: {
    description: 'Start the ssb-server daemon and generate ~/.ssb/manifest.json',
    example: 'ssb-server start',
    type: 'cli'
  },
  config: {
    description: 'Print the effective configuration used by the server',
    example: 'ssb-server config',
    type: 'sync'
  },
  blobs: {
    description: 'Manage blob storage, listing, adding, and pushing binary data.',
    example: 'ssb-server blobs.ls'
  },
  auth: {
    description: 'Create the RPC authentication handshake for connecting to a remote peer.',
    example: 'ssb-server auth net:example.com:8008~shs:<key>'
  },
  address: {
    description: 'Show the multi-server addresses clients can use to reach this server.',
    example: 'ssb-server address'
  },
  manifest: {
    description: 'Dump the RPC manifest so other programs know what to call.',
    example: 'ssb-server manifest'
  },
  'multiserver.parse': {
    description: 'Parse a multi-server address string into host/port/key components.',
    example: 'ssb-server multiserver.parse net:example.com:8008~shs:<key>'
  },
  'multiserver.address': {
    description: 'Build a canonical multi-server address from host, port, and key.',
    example: 'ssb-server multiserver.address --host example.com --port 8008 --key @abc.ed25519'
  },
  multiserver: {
    description: 'Helpers around multi-server address parsing and building.',
    example: 'ssb-server multiserver.parse net:example.com:8008~shs:<key>'
  },
  multiserverNet: {
    description: 'Inspect the legacy net transport configuration used by multi-server.',
    example: 'ssb-server multiserverNet'
  },
  createFeedStream: {
    description: 'Stream a feed by timestamp, optionally filtering with gt/gte/lt/lte and live=true.',
    example: 'ssb-server createFeedStream --live --gt 0'
  },
  messagesByType: {
    description: 'Stream messages filtered by the `type` field, ordered by receive time.',
    example: 'ssb-server messagesByType --type about'
  },
  createUserStream: {
    description: 'Stream a feed by sequence numbers with support for range filters.',
    example: 'ssb-server createUserStream --id @alice --live'
  },
  createWriteStream: {
    description: 'Send newline-delimited JSON messages on stdin straight into the database.',
    example: 'cat message.json | ssb-server createWriteStream'
  },
  createSequenceStream: {
    description: 'Stream the global sequence counter to track when the database advances.',
    example: 'ssb-server createSequenceStream --live'
  },
  links: {
    description: 'Query link edges (`source`, `dest`, `rel`) between messages, feeds, and blobs.',
    example: 'ssb-server links --source @alice'
  },
  getLatest: {
    description: 'Fetch a feed’s latest message so you can inspect the head of the log.',
    example: 'ssb-server getLatest @alice'
  },
  latest: {
    description: 'Stream the latest sequence seen for every feed that this server follows.',
    example: 'ssb-server latest --limit 20'
  },
  latestSequence: {
    description: 'Return the highest sequence number a feed has reached locally.',
    example: 'ssb-server latestSequence @alice'
  },
  del: {
    description: 'Drop a message from the local log (only works if the message is still cached).',
    example: 'ssb-server del %messageid.sha256'
  },
  getVectorClock: {
    description: 'Print the vector clock used when deciding how much of each feed we have.',
    example: 'ssb-server getVectorClock'
  },
  help: {
    description: 'Show the CLI help overview or focus on a single command.',
    example: 'ssb-server help publish'
  },
  'plugins.help': {
    description: 'List the plugin subcommands (install, uninstall, enable, disable).',
    example: 'ssb-server plugins.help'
  },
  plugins: {
    description: 'Manage ssb-server plugins (install, uninstall, enable, disable).',
    example: 'ssb-server plugins.install plugin@version'
  },
  gossip: {
    description: 'Manage gossip peers, connections, and their metadata.',
    example: 'ssb-server gossip.peers'
  },
  'gossip.peers': {
    description: 'List the gossip table peers and their current connection state.',
    example: 'ssb-server gossip.peers'
  },
  'gossip.get': {
    description: 'Inspect the gossip metadata for a peer by id or address.',
    example: 'ssb-server gossip.get @peer'
  },
  'gossip.ping': {
    description: 'Ping a peer to measure reachability, RTT, and grab a quick status.',
    example: 'ssb-server gossip.ping @peer'
  },
  'gossip.help': {
    description: 'Show gossip subcommands and their purpose.',
    example: 'ssb-server gossip.help'
  },
  'blobs.meta': {
    description: 'Read metadata (size, timestamps) for a blob without streaming the payload.',
    example: 'ssb-server blobs.meta &blobid.sha256'
  },
  'blobs.changes': {
    description: 'Stream notifications when blobs change locally (use --live to keep the stream open).',
    example: 'ssb-server blobs.changes --live'
  },
  'blobs.createWants': {
    description: 'Watch the current want list for peers so you can mirror their needs.',
    example: 'ssb-server blobs.createWants --live'
  },
  'blobs.help': {
    description: 'List available blob commands and their arguments.',
    example: 'ssb-server blobs.help'
  },
  'invite.use': {
    description: 'Call this on the server that owns an invite code; it validates one code and publishes a follow for the provided feed.',
    example: 'ssb-server invite.use INVITE_CODE --feed @friend'
  },
  invite: {
    description: 'Create, accept, or use invites for pubs.',
    example: 'ssb-server invite.create 1'
  },
  'friends.help': {
    description: 'List the available friends.* subcommands.',
    example: 'ssb-server friends.help'
  },
  friends: {
    description: 'Inspect the follow/block graph maintained by the friends plugin.',
    example: 'ssb-server friends.hops'
  },
  'friends.onEdge': {
    description: 'Inspect edges (follows/blocks) on the friends graph between feeds.',
    example: 'ssb-server friends.onEdge --start @alice'
  },
  query: {
    description: 'Run map/filter/reduce queries or explain how indexes are used.',
    example: 'ssb-server query.read --query "{\\"type\\":\\"post\\"}"'
  },
  'query.help': {
    description: 'Show the query.* commands for running or explaining map-filter-reduce queries.',
    example: 'ssb-server query.help'
  },
  'links2.read': {
    description: 'Run the newer links2 indexes to get fast link traversals.',
    example: 'ssb-server links2.read --query "{\\"dest\\":\\"@id\\"}"'
  },
  'links2.help': {
    description: 'Describe how to use the links2 query interface.',
    example: 'ssb-server links2.help'
  },
  links2: {
    description: 'Advanced multi-index link queries built on top of the links2 flumeview.',
    example: 'ssb-server links2.read --query "{\\"dest\\":\\"@id\\"}"'
  },
  replicate: {
    description: 'Legacy replication controls for requesting and blocking feeds.',
    example: 'ssb-server replicate.request --id @alice'
  },
  ebt: {
    description: 'EBT helpers for controlling replication with peers.',
    example: 'ssb-server ebt.replicate --peer <multi-server-address>'
  },
  'ebt.replicate': {
    description: 'Open a duplex replication stream that speaks the EBT protocol.',
    example: 'ssb-server ebt.replicate --peer <multi-server-address>'
  },
  'ebt.request': {
    description: 'Request that a peer replicate a specific feed.',
    example: 'ssb-server ebt.request @alice'
  },
  'ebt.block': {
    description: 'Block or unblock replication for another feed.',
    example: 'ssb-server ebt.block --from @you --to @them --blocking true'
  },
  'ebt.peerStatus': {
    description: 'Read the last-known metadata for an EBT peer connection.',
    example: 'ssb-server ebt.peerStatus @peer'
  },
  ooo: {
    description: 'Out-of-order (ooo) helpers for sharing messages without full replication.',
    example: 'ssb-server ooo.stream @friend'
  },
  'ooo.stream': {
    description: 'Stream messages handled out-of-order to avoid waiting for full replication.',
    example: 'ssb-server ooo.stream @friend'
  },
  'ooo.help': {
    description: 'Show the commands exposed by the ooo (out-of-order) plugin.',
    example: 'ssb-server ooo.help'
  },
  ws: {
    description: 'Inspect the websocket transport that Patchbay Lite and browsers rely on.',
    example: 'ssb-server ws'
  },
  frontend: {
    description: 'Serve the built-in Patchbay Lite UI over ssb-ws.',
    example: 'ssb-server frontend'
  },
  private1: {
    description: 'Expose the private1 transport helper for unix sockets or internal tooling.',
    example: 'ssb-server private1'
  },
  'list-commands': {
    description: 'Print every available RPC command in the manifest/catalog.',
    example: 'ssb-server list-commands'
  }
}

function cloneArgs (args) {
  if (!args) return {}
  var copy = {}
  Object.keys(args).forEach(function (key) {
    copy[key] = args[key]
  })
  return copy
}

function buildExample (name, args) {
  var parts = ['ssb-server', name]
  var argNames = args ? Object.keys(args).sort() : []
  argNames.forEach(function (arg) {
    var type = args[arg] && args[arg].type ? args[arg].type : 'value'
    parts.push('--' + arg + ' <' + type + '>')
  })
  return parts.join(' ')
}

function addEntry (catalog, name, info) {
  var args = cloneArgs(info.args)
  catalog[name] = {
    description: info.description || '',
    args: args,
    type: info.type || 'async',
    example: info.example || buildExample(name, args)
  }
}

function loadPluginEntries () {
  var pluginsDir = path.join(__dirname, '..', 'plugins')
  var catalog = {}
  if (!fs.existsSync(pluginsDir)) return catalog

  fs.readdirSync(pluginsDir).forEach(function (pluginName) {
    var pluginPath = path.join(pluginsDir, pluginName)
    var stats
    try {
      stats = fs.statSync(pluginPath)
    } catch (_) {
      return
    }
    if (!stats.isDirectory()) return

    var helpFile = path.join(pluginPath, 'help.js')
    if (!fs.existsSync(helpFile)) return

    var helpModule
    try {
      helpModule = require(helpFile)
    } catch (_) {
      return
    }
    var commands = helpModule.commands || {}
    var pluginDescription = helpModule.description
    Object.keys(commands).forEach(function (commandName) {
      var commandHelp = commands[commandName] || {}
      var description = commandHelp.description || pluginDescription || ''
      addEntry(catalog, pluginName + '.' + commandName, {
        description: description,
        args: commandHelp.args,
        type: commandHelp.type
      })
    })
  })

  return catalog
}

var externalHelpModules = [
  { name: 'ssb-db', prefix: '' },
  { name: 'ssb-blobs', prefix: 'blobs' },
  { name: 'ssb-gossip', prefix: 'gossip' },
  { name: 'ssb-replicate', prefix: 'replicate' },
  { name: 'ssb-query', prefix: 'query' },
  { name: 'ssb-links', prefix: 'links' },
  { name: 'ssb-ooo', prefix: 'ooo' },
  { name: 'ssb-plugins', prefix: 'plugins' }
]

function loadExternalHelpEntries () {
  var catalog = {}
  externalHelpModules.forEach(function (moduleInfo) {
    var helpModule
    try {
      helpModule = require(moduleInfo.name + '/help')
    } catch (_) {
      return
    }
    var moduleDescription = helpModule.description
    var commands = helpModule.commands || {}
    Object.keys(commands).forEach(function (commandName) {
      var info = commands[commandName] || {}
      var name = moduleInfo.prefix ? moduleInfo.prefix + '.' + commandName : commandName
      addEntry(catalog, name, {
        description: info.description || moduleDescription || '',
        args: info.args,
        type: info.type
      })
    })
  })
  return catalog
}

function createPlaceholder (name, manifestType) {
  var entry = {
    description: 'No detailed help is currently available for this command.',
    args: {},
    type: manifestType || 'async',
    example: 'ssb-server ' + name
  }
  return entry
}

function createCatalog (manifest) {
  manifest = manifest || {}
  var catalog = {}

  var pluginEntries = loadPluginEntries()
  Object.keys(pluginEntries).forEach(function (name) {
    catalog[name] = pluginEntries[name]
  })

  var externalEntries = loadExternalHelpEntries()
  Object.keys(externalEntries).forEach(function (name) {
    catalog[name] = externalEntries[name]
  })

  Object.keys(manualEntries).forEach(function (name) {
    addEntry(catalog, name, manualEntries[name])
  })

  Object.keys(manifest).forEach(function (name) {
    if (!catalog[name]) {
      catalog[name] = createPlaceholder(name, manifest[name])
    } else if (!catalog[name].type && manifest[name]) {
      catalog[name].type = manifest[name]
    }
  })

  var names = Object.keys(catalog).sort()

  return {
    entries: catalog,
    names: names,
    get: function (name) {
      return catalog[name]
    },
    all: function () {
      return names.map(function (name) {
        return { name: name, entry: catalog[name] }
      })
    }
  }
}

module.exports = {
  createCatalog: createCatalog
}
