'use strict'

const fs        = require('fs')
const http      = require('http')
const path      = require('path')
const pull      = require('pull-stream')
const toPull    = require('stream-to-pull-stream')
const gitServer = require('../plugins/git-server')

const DEFAULT_HOST = '127.0.0.1'

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.otf':  'font/otf',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.eot':  'application/vnd.ms-fontobject',
  '.pdf':  'application/pdf',
  '.ico':  'image/x-icon'
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_MAP[ext] || 'application/octet-stream'
}

function resolvePath(reqPath) {
  let pathname = (reqPath || '/').split('?')[0]
  if (!pathname || pathname === '/') pathname = '/index.html'
  const relative = pathname.replace(/^\/+/, '') || 'index.html'
  if (relative.indexOf('..') !== -1) return null
  return relative
}

function splitHostPort(rawHost) {
  if (!rawHost || typeof rawHost !== 'string') return null
  if (rawHost[0] === '[') {
    const end = rawHost.indexOf(']')
    if (end === -1) return { host: rawHost, port: null }
    const rest = rawHost.slice(end + 1)
    if (rest[0] === ':' && /^\d+$/.test(rest.slice(1)))
      return { host: rawHost.slice(0, end + 1), port: Number(rest.slice(1)) }
    return { host: rawHost, port: null }
  }
  if (/:\d+$/.test(rawHost)) {
    const lastColon = rawHost.lastIndexOf(':')
    return { host: rawHost.slice(0, lastColon), port: Number(rawHost.slice(lastColon + 1)) }
  }
  return { host: rawHost, port: null }
}

function getBaseHost(hostHeader) {
  if (!hostHeader || typeof hostHeader !== 'string') return null
  if (hostHeader[0] === '[') {
    const end = hostHeader.indexOf(']')
    return end === -1 ? hostHeader : hostHeader.slice(0, end + 1)
  }
  const colon = hostHeader.indexOf(':')
  return colon === -1 ? hostHeader : hostHeader.slice(0, colon)
}

function formatHostForUrl(host) {
  if (!host || typeof host !== 'string') return host
  if (host[0] === '[') return host
  return host.indexOf(':') !== -1 ? '[' + host + ']' : host
}

function requestIsForwarded(req) {
  return !!(req && req.headers && (
    req.headers['x-forwarded-host'] ||
    req.headers['x-forwarded-proto'] ||
    req.headers['x-forwarded-port']
  ))
}

function pickSharedWsExternal(wsIncoming) {
  if (!Array.isArray(wsIncoming)) return null

  for (const conf of wsIncoming) {
    if (conf && typeof conf.external === 'string' && conf.external)
      return conf.external
  }

  for (const conf of wsIncoming) {
    if (!conf || typeof conf.host !== 'string' || !conf.host) continue
    const scope = Array.isArray(conf.scope) ? conf.scope : [conf.scope]
    if (scope.indexOf('public') !== -1) return conf.host
  }

  return null
}

// Additive: append a ws entry for this server/port, replacing any existing
// entry at the same port so repeated calls stay idempotent.
function attachWsToServer(config, server, port) {
  if (!config || config.ws === false) return

  const wsIncoming = config.connections &&
    config.connections.incoming &&
    Array.isArray(config.connections.incoming.ws)
    ? config.connections.incoming.ws
    : []

  const first = wsIncoming[0] || {}
  const entry = {
    scope: ['device', 'local', 'public'],
    transform: first.transform || 'shs',
    port,
    server
  }
  const external = pickSharedWsExternal(wsIncoming)
  if (external) entry.external = external

  if (!config.connections) config.connections = {}
  if (!config.connections.incoming) config.connections.incoming = {}
  // Keep entries for other ports; replace any entry already at this port.
  const others = wsIncoming.filter(e => e && e.port !== port && e.server !== server)
  config.connections.incoming.ws = others.concat([entry])

  if (!config.ws || typeof config.ws !== 'object') config.ws = {}
  config.ws.port = port
  config.ws.server = server
}

/**
 * Create and start an HTTP server that serves a Decent-style SSB UI.
 *
 * opts:
 *   pluginName      {string}  e.g. 'decent-ui'     (used in log messages)
 *   configNamespace {string}  e.g. 'decent'         (reads config[configNamespace])
 *   defaultPort     {number}  e.g. 8888
 *   stylesheetName  {string}  e.g. 'style.css'      (must contain 'style.css' substring
 *                                                     so the app fallback check fires)
 *   buildDir        {string}  absolute path to built HTML/CSS/JS (decent/build)
 *   launchMessage   {string}  e.g. 'Decent launched at'
 *
 * Returns { port, host }.
 */
function createUiServer(sbot, config, opts) {
  const {
    pluginName,
    configNamespace,
    defaultPort,
    stylesheetName,
    buildDir,
    launchMessage
  } = opts

  const docsDir = path.join(__dirname, '..', 'docs')
  const cfg     = (config && config[configNamespace]) || {}
  const wsCfg   = (config && config.ws) || {}
  const port    = typeof cfg.port === 'number'
    ? cfg.port
    : typeof wsCfg.port === 'number'
      ? wsCfg.port
      : defaultPort
  const host    = typeof cfg.host === 'string' ? cfg.host : DEFAULT_HOST
  const wsPort  = typeof wsCfg.port === 'number' ? wsCfg.port : 8989
  const wsHost  = typeof cfg.wsHost === 'string' ? cfg.wsHost : null
  const wsRemote = typeof cfg.wsRemote === 'string' ? cfg.wsRemote : null
  let loggedRemote = false

  // Compute cache-busted stylesheet href.
  let styleHref = '/' + stylesheetName
  try {
    const builtStat = fs.statSync(path.join(buildDir, stylesheetName))
    styleHref = '/' + stylesheetName + '?v=' + builtStat.mtimeMs
  } catch (_) {
    try {
      // Fallback: source stylesheet sits one level above the build dir.
      const fallbackStat = fs.statSync(path.join(buildDir, '..', stylesheetName))
      styleHref = '/' + stylesheetName + '?v=' + fallbackStat.mtimeMs
    } catch (_) {}
  }

  console.log(pluginName + ' config:', JSON.stringify(cfg))

  function respondNotFound(res) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not found')
  }

  function respondInvalid(res) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Invalid request')
  }

  function getRemoteForRequest(req) {
    if (!sbot || !sbot.id || typeof sbot.id !== 'string') return null
    if (!req || !req.headers) return null

    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host
    const baseHost   = getBaseHost(hostHeader)
    if (!baseHost) return null

    let proto = 'http'
    if (req.connection && req.connection.encrypted) proto = 'https'
    else if (typeof req.headers['x-forwarded-proto'] === 'string')
      proto = req.headers['x-forwarded-proto'].split(',')[0].trim()

    const wsProto = proto === 'https' ? 'wss' : 'ws'
    const i   = sbot.id.indexOf('.')
    const key = i === -1 ? sbot.id.substring(1) : sbot.id.substring(1, i)

    if (wsRemote) {
      const explicitRemote = wsRemote + '~shs:' + key
      if (!loggedRemote) { loggedRemote = true; console.log(pluginName + ' ws remote:', explicitRemote) }
      return explicitRemote
    }

    if (requestIsForwarded(req)) {
      const sameOriginRemote = wsProto + '://' + formatHostForUrl(baseHost) + '~shs:' + key
      if (!loggedRemote) { loggedRemote = true; console.log(pluginName + ' ws remote:', sameOriginRemote) }
      return sameOriginRemote
    }

    const wsTarget  = wsHost || baseHost
    const parsed    = splitHostPort(wsTarget)
    const hostName  = formatHostForUrl(parsed ? parsed.host : wsTarget)
    const hostPort  = (parsed && parsed.port) ? parsed.port : wsPort
    const remote    = wsProto + '://' + hostName + ':' + hostPort + '~shs:' + key

    if (!loggedRemote) { loggedRemote = true; console.log(pluginName + ' ws remote:', remote) }
    return remote
  }

  function serveStatic(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respondInvalid(res)
      return
    }

    const relPath = resolvePath(req.url)
    if (!relPath) { respondInvalid(res); return }

    const filePath = path.join(buildDir, relPath)

    function serveFile(resolvedPath) {
      if (relPath === 'index.html' && req.method === 'GET') {
        return fs.readFile(resolvedPath, 'utf8', (readErr, html) => {
          if (readErr) { respondNotFound(res); return }

          // For a non-default stylesheet, rewrite /style.css links in the
          // built HTML so the correct skin is loaded without a JS-bundle change.
          if (stylesheetName !== 'style.css') {
            html = html.replace(
              /(<link[^>]+href=")\/style\.css(\??[^"]*")/g,
              '$1/' + stylesheetName + '$2'
            )
          }

          let headInsert = ''
          if (!html.includes('rel="stylesheet" href="/' + stylesheetName + '"') &&
              !html.includes('rel="stylesheet" href="' + stylesheetName + '"')) {
            headInsert += '<link rel="preload" as="style" href="' + styleHref + '">' +
                          '<link rel="stylesheet" href="' + styleHref + '">'
          }

          const remote = getRemoteForRequest(req)
          if (remote)
            headInsert += '<script>window.PATCHBAY_REMOTE = ' + JSON.stringify(remote) + ';</script>'

          if (headInsert) html = html.replace('</head>', headInsert + '</head>')

          res.writeHead(200, { 'Content-Type': getContentType(resolvedPath) })
          res.end(html)
        })
      }

      res.writeHead(200, { 'Content-Type': getContentType(resolvedPath) })
      if (req.method === 'HEAD') { res.end(); return }
      fs.createReadStream(resolvedPath).pipe(res)
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat || !stat.isFile()) {
        if (relPath === 'favicon.ico') {
          res.statusCode = 204
          res.end()
          return
        }
        if (relPath === stylesheetName) {
          // Stylesheet not in build dir — try one level up (source location).
          const fallbackPath = path.join(buildDir, '..', stylesheetName)
          return fs.stat(fallbackPath, (fallbackErr, fallbackStat) => {
            if (fallbackErr || !fallbackStat || !fallbackStat.isFile()) { respondNotFound(res); return }
            serveFile(fallbackPath)
          })
        }
        respondNotFound(res)
        return
      }
      serveFile(filePath)
    })
  }

  function handleBlobAdd(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    pull(
      toPull(req),
      sbot.blobs.add(function (err, hash) {
        if (err) {
          res.statusCode = 500
          res.end(err.message || 'blob add error')
          return
        }
        res.end(hash)
      })
    )
  }

  function handleBlobGet(req, res) {
    const blobHash = decodeURIComponent(req.url.replace(/^\/blobs\/get\/?/, ''))
    if (!blobHash) { respondNotFound(res); return }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'max-age=31536000')
    pull(
      sbot.blobs.get(blobHash),
      toPull.sink(res, function (err) {
        if (err && !res.headersSent) { res.statusCode = 404; res.end('not found') }
      })
    )
  }

  function serveDocsFile(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { respondInvalid(res); return }
    const stripped = req.url.replace(/^\/docs\/?/, '') || 'index.html'
    const rel = stripped.split('?')[0]
    if (rel.indexOf('..') !== -1) { respondInvalid(res); return }
    const base = path.join(docsDir, 'scuttlebot.io')
    const candidates = [
      path.join(base, rel),
      path.join(base, rel, 'index.html')
    ]
    function tryNext(i) {
      if (i >= candidates.length) { respondNotFound(res); return }
      fs.stat(candidates[i], (err, stat) => {
        if (err || !stat || !stat.isFile()) { tryNext(i + 1); return }
        const ct = getContentType(candidates[i])
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': ct })
          res.end()
          return
        }
        if (ct.startsWith('text/html')) {
          fs.readFile(candidates[i], 'utf8', (rErr, html) => {
            if (rErr) { respondNotFound(res); return }
            html = html.replace(/(href|src)="\/(?!\/)/g, '$1="/docs/')
            res.writeHead(200, { 'Content-Type': ct })
            res.end(html)
          })
        } else {
          res.writeHead(200, { 'Content-Type': ct })
          fs.createReadStream(candidates[i]).pipe(res)
        }
      })
    }
    tryNext(0)
  }

  function handleRequest(req, res) {
    if (req.method === 'POST' && req.url === '/blobs/add') {
      handleBlobAdd(req, res)
      return
    }
    if ((req.method === 'GET' || req.method === 'HEAD') &&
        req.url.startsWith('/blobs/get')) {
      handleBlobGet(req, res)
      return
    }
    if ((req.method === 'GET' || req.method === 'HEAD') &&
        (req.url === '/docs' || req.url.startsWith('/docs/'))) {
      serveDocsFile(req, res)
      return
    }
    if (gitServer.handleGitRequest(sbot, req, res)) return
    serveStatic(req, res)
  }

  const server = http.createServer(handleRequest)
  attachWsToServer(config, server, port)

  server.on('error', (err) => {
    console.error(pluginName + ' server error:', err.message || err)
  })

  server.listen(port, host, () => {
    const addr = server.address()
    const listeningPort = (addr && addr.port) ? addr.port : port
    console.log(launchMessage + ' http://' + host + ':' + listeningPort + '/')
  })

  let closed = false
  function closeServer(cb) {
    if (closed) return cb && cb()
    closed = true
    server.close(() => { cb && cb() })
  }
  process.once('exit', closeServer)

  return { port, host }
}

module.exports = { createUiServer, attachWsToServer }
