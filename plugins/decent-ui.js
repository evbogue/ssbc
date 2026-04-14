'use strict'

const fs        = require('fs')
const http      = require('http')
const path      = require('path')
const gitServer = require('./git-server')

const DEFAULT_PORT = 8888
const DEFAULT_HOST = '127.0.0.1'
const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.svg':  'image/svg+xml'
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

exports.name = 'decent-ui'
exports.version = '1.0.0'
exports.manifest = {}

exports.init = function (sbot, config) {
  const decentDir = path.join(__dirname, '..', 'decent', 'build')
  const cfg    = (config && config.decent) || {}
  const port   = typeof cfg.port === 'number' ? cfg.port : DEFAULT_PORT
  const host   = typeof cfg.host === 'string' ? cfg.host : DEFAULT_HOST
  let styleHref = '/style.css'

  try {
    const builtStylePath = path.join(decentDir, 'style.css')
    const builtStat = fs.statSync(builtStylePath)
    styleHref = '/style.css?v=' + builtStat.mtimeMs
  } catch (_) {
    try {
      const fallbackStylePath = path.join(__dirname, '..', 'decent', 'style.css')
      const fallbackStat = fs.statSync(fallbackStylePath)
      styleHref = '/style.css?v=' + fallbackStat.mtimeMs
    } catch (_) {}
  }
  const wsCfg  = (config && config.ws) || {}
  const wsPort = typeof wsCfg.port === 'number' ? wsCfg.port : 8989
  let wsHost   = typeof cfg.wsHost === 'string' ? cfg.wsHost : null
  const wsRemote = typeof cfg.wsRemote === 'string' ? cfg.wsRemote : null
  let loggedRemote = false

  console.log('decent-ui config:', JSON.stringify(cfg))

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
      if (!loggedRemote) { loggedRemote = true; console.log('decent-ui ws remote:', explicitRemote) }
      return explicitRemote
    }

    const wsTarget  = wsHost || baseHost
    const parsed    = splitHostPort(wsTarget)
    const hostName  = formatHostForUrl(parsed ? parsed.host : wsTarget)
    const hostPort  = (parsed && parsed.port) ? parsed.port : wsPort
    const remote    = wsProto + '://' + hostName + ':' + hostPort + '~shs:' + key

    if (!loggedRemote) { loggedRemote = true; console.log('decent-ui ws remote:', remote) }
    return remote
  }

  function serveStatic(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respondInvalid(res)
      return
    }

    const relPath = resolvePath(req.url)
    if (!relPath) { respondInvalid(res); return }

    const filePath = path.join(decentDir, relPath)

    function serveFile(resolvedPath) {
      if (relPath === 'index.html' && req.method === 'GET') {
        return fs.readFile(resolvedPath, 'utf8', (readErr, html) => {
          if (readErr) { respondNotFound(res); return }

          let headInsert = ''
          if (!html.includes('rel="stylesheet" href="/style.css"') &&
              !html.includes('rel="stylesheet" href="style.css"')) {
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
        if (relPath === 'style.css') {
          const fallbackPath = path.join(__dirname, '..', 'decent', 'style.css')
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

  function handleRequest(req, res) {
    if (gitServer.handleGitRequest(sbot, req, res)) return
    serveStatic(req, res)
  }

  const server = http.createServer(handleRequest)

  server.on('error', (err) => {
    console.error('decent-ui server error:', err.message || err)
  })

  server.listen(port, host, () => {
    const addr = server.address()
    const listeningPort = (addr && addr.port) ? addr.port : port
    console.log('Decent launched at http://' + host + ':' + listeningPort + '/')
  })

  let closed = false
  function closeServer(cb) {
    if (closed) return cb && cb()
    closed = true
    server.close(() => { cb && cb() })
  }

  process.once('exit', closeServer)

  return { decent: { port, host } }
}
