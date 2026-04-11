'use strict'

// Git smart HTTP server plugin for SSB.
//
// Implements git smart HTTP protocol endpoints:
//   GET  /git/:repoId/info/refs?service=git-upload-pack   (clone/fetch refs)
//   POST /git/:repoId/git-upload-pack                     (clone/fetch pack)
//   GET  /git/:repoId/info/refs?service=git-receive-pack  (push refs)
//   POST /git/:repoId/git-receive-pack                    (push pack)
//
// SSB RPC:
//   git.create(name, cb) → HTTP URL for the new repo

const pull    = require('pull-stream')
const cat     = require('pull-cat')
const gitRepo = require('ssb-git-repo')
const GitRepo = require('pull-git-repo')
const indexPack = require('pull-git-pack/lib/index-pack')

// ── pkt-line helpers ─────────────────────────────────────────────────────────

function pktLine(str) {
  const data = Buffer.isBuffer(str) ? str : Buffer.from(str, 'utf8')
  const len = (data.length + 4).toString(16).padStart(4, '0')
  return Buffer.concat([Buffer.from(len, 'ascii'), data])
}
const FLUSH = Buffer.from('0000', 'ascii')

// Wrap data in a sideband-64k packet (band 1 = data, 2 = progress, 3 = error).
function sidebandPkt(band, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
  return pktLine(Buffer.concat([Buffer.from([band]), payload]))
}

// Read the full HTTP request body as a single Buffer.
function readBody(req, cb) {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', () => cb(null, Buffer.concat(chunks)))
  req.on('error', cb)
}

// Parse pkt-lines from a Buffer until a flush packet (0000).
// Returns { lines: string[], rest: Buffer } where rest is any bytes after the flush.
function parsePktLines(buf) {
  const lines = []
  let i = 0
  while (i + 4 <= buf.length) {
    const lenStr = buf.slice(i, i + 4).toString('ascii')
    if (lenStr === '0000') { i += 4; break }
    const len = parseInt(lenStr, 16)
    if (isNaN(len) || len < 4) break
    const line = buf.slice(i + 4, i + len).toString('ascii').replace(/\n$/, '')
    lines.push(line)
    i += len
  }
  return { lines, rest: buf.slice(i) }
}

// Build the full ref advertisement body for an info/refs response.
// refs:    [{name, hash}]
// symrefs: [{name, ref}]  (e.g. {name:'HEAD', ref:'refs/heads/master'})
function buildRefAdvert(service, refs, symrefs) {
  const caps = service === 'git-upload-pack'
    ? ['multi_ack_detailed', 'no-done', 'side-band-64k', 'thin-pack', 'ofs-delta', 'no-progress', 'include-tag']
    : ['report-status', 'delete-refs', 'no-thin', 'quiet', 'ofs-delta']

  // symref=HEAD:refs/heads/master style capabilities
  const validSymrefs = symrefs.filter(s => s.ref)
  validSymrefs.forEach(s => caps.push(`symref=${s.name}:${s.ref}`))

  // Build map: target ref name → list of symref names pointing to it
  const symrefByTarget = {}
  validSymrefs.forEach(({ name, ref }) => {
    if (!symrefByTarget[ref]) symrefByTarget[ref] = []
    symrefByTarget[ref].push(name)
  })

  const bufs = [pktLine(`# service=${service}\n`), FLUSH]
  const emptyHash = '0000000000000000000000000000000000000000'
  let first = true

  function addRefLine(hash, name) {
    if (first) {
      first = false
      bufs.push(pktLine(`${hash} ${name}\0${caps.join(' ')}\n`))
    } else {
      bufs.push(pktLine(`${hash} ${name}\n`))
    }
  }

  if (refs.length === 0) {
    // Empty repo: advertise placeholder so git knows our capabilities.
    addRefLine(emptyHash, 'capabilities^{}')
  } else {
    refs.forEach(ref => {
      addRefLine(ref.hash, ref.name)
      // Insert symrefs that point to this ref right after it.
      const symnames = symrefByTarget[ref.name]
      if (symnames) symnames.forEach(sym => addRefLine(ref.hash, sym))
    })
  }

  bufs.push(FLUSH)
  return bufs
}

// Collect refs and symrefs from a Repo object into plain arrays.
function collectRefs(repo, cb) {
  pull(repo.refs(), pull.collect((err, refs) => {
    if (err) return cb(err)
    pull(repo.symrefs(), pull.collect((err, symrefs) => {
      if (err) return cb(err)
      cb(null, refs, symrefs)
    }))
  }))
}

// Convert a Buffer to a pull-stream source (emits one chunk).
function bufToPull(buf) {
  let done = false
  return (end, cb) => {
    if (end || done) { done = true; return cb(true) }
    done = true
    cb(null, buf)
  }
}

// ── HTTP route handlers ───────────────────────────────────────────────────────

function handleInfoRefs(sbot, repoId, service, res) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) {
      res.statusCode = 404
      res.end('Repository not found: ' + err.message)
      return
    }
    GitRepo(repo)

    collectRefs(repo, (err, refs, symrefs) => {
      if (err) { res.statusCode = 500; res.end('Error: ' + err.message); return }

      const advert = buildRefAdvert(service, refs, symrefs)
      const ct = service === 'git-upload-pack'
        ? 'application/x-git-upload-pack-advertisement'
        : 'application/x-git-receive-pack-advertisement'

      res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-cache' })
      advert.forEach(buf => res.write(buf))
      res.end()
    })
  })
}

function handleUploadPack(sbot, repoId, req, res) {
  readBody(req, (err, body) => {
    if (err) { res.statusCode = 500; res.end(err.message); return }

    // HTTP upload-pack request: two pkt-line sections.
    // Section 1 (until first flush): want lines
    // Section 2 (until second flush or done pkt-line): have lines
    const { lines: wantLines, rest: rest1 } = parsePktLines(body)
    const { lines: haveLines } = parsePktLines(rest1)
    const wants = {}
    const haves = {}
    for (const line of wantLines) {
      if (line.startsWith('want ')) wants[line.slice(5, 45)] = true
    }
    for (const line of haveLines) {
      if (line.startsWith('have ')) haves[line.slice(5, 45)] = true
    }

    gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
      if (err) { res.statusCode = 404; res.end('Repository not found'); return }
      GitRepo(repo)

      res.writeHead(200, {
        'Content-Type': 'application/x-git-upload-pack-result',
        'Cache-Control': 'no-cache'
      })

      if (Object.keys(wants).length === 0) {
        res.write(pktLine('NAK\n'))
        res.end()
        return
      }

      repo.getPack(wants, haves, {}, (err, packStream) => {
        if (err) {
          console.error('git-server: getPack error:', err)
          res.write(pktLine('NAK\n'))
          res.write(FLUSH)
          return res.end()
        }
        res.write(pktLine('NAK\n'))
        // Pack data must be sideband-wrapped (we advertise side-band-64k).
        pull(packStream, pull.drain(
          chunk => res.write(sidebandPkt(0x01, chunk)),
          (err) => {
            if (err && err !== true) {
              console.error('git-server: pack stream error:', err)
              res.write(sidebandPkt(0x03, 'pack error: ' + err.message + '\n'))
            }
            res.write(FLUSH)
            res.end()
          }
        ))
      })
    })
  })
}

function handleReceivePack(sbot, repoId, req, res) {
  readBody(req, (err, body) => {
    if (err) { res.statusCode = 500; res.end(err.message); return }

    // Pkt-lines until flush = ref updates; remainder is raw pack data.
    const { lines, rest } = parsePktLines(body)

    // Parse ref update lines: "<old> <new> <name>[\0<caps>]"
    const updates = []
    for (const line of lines) {
      const nullIdx = line.indexOf('\0')
      const refStr = nullIdx !== -1 ? line.slice(0, nullIdx) : line
      const parts = refStr.split(' ')
      if (parts.length < 3) continue
      const emptyHash = '0000000000000000000000000000000000000000'
      updates.push({
        old: parts[0] === emptyHash ? null : parts[0],
        new: parts[1] === emptyHash ? null : parts[1],
        name: parts[2]
      })
    }

    gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
      if (err) { res.statusCode = 404; res.end('Repository not found'); return }
      GitRepo(repo)

      const refNames = updates.map(u => u.name)
      const hasPack  = rest.length > 0 && updates.some(u => u.new !== null)

      function sendResult(err) {
        res.writeHead(200, {
          'Content-Type': 'application/x-git-receive-pack-result',
          'Cache-Control': 'no-cache'
        })
        if (err) {
          res.write(pktLine('unpack ' + err.message + '\n'))
        } else {
          res.write(pktLine('unpack ok\n'))
          refNames.forEach(name => res.write(pktLine(`ok ${name}\n`)))
        }
        res.write(FLUSH)
        res.end()
      }

      if (updates.length === 0) return sendResult(null)

      if (!hasPack) {
        repo.uploadPack(pull.values(updates), pull.empty(), sendResult)
        return
      }

      // Index the packfile (requires git on PATH), then store it via uploadPack.
      indexPack(bufToPull(rest), (err, idxStream, packfileFixed) => {
        if (err) return sendResult(new Error('index-pack failed: ' + err.message))
        repo.uploadPack(pull.values(updates), pull.once({
          pack: packfileFixed,
          idx:  idxStream
        }), sendResult)
      })
    })
  })
}

// ── Route parser ──────────────────────────────────────────────────────────────

// Returns null if not a git route; otherwise { repoId, endpoint, service }.
function parseGitRoute(req) {
  const raw      = req.url || '/'
  const qIdx     = raw.indexOf('?')
  const pathname = qIdx === -1 ? raw : raw.slice(0, qIdx)
  const query    = qIdx === -1 ? '' : raw.slice(qIdx + 1)

  const m = pathname.match(/^\/git\/([^/]+)\/(info\/refs|git-upload-pack|git-receive-pack)$/)
  if (!m) return null

  let repoId
  try { repoId = decodeURIComponent(m[1]) } catch (_) { return null }

  const endpoint = m[2]
  let service

  if (endpoint === 'info/refs') {
    const sm = query.match(/(?:^|&)service=([^&]+)/)
    service = sm ? decodeURIComponent(sm[1]) : null
    if (service !== 'git-upload-pack' && service !== 'git-receive-pack') return null
  } else {
    service = endpoint
  }

  return { repoId, endpoint, service }
}

// ── SSB plugin ────────────────────────────────────────────────────────────────

module.exports = {
  name: 'git',
  version: '1.0.0',
  manifest: { create: 'async' },
  permissions: { master: { allow: ['create'] } },

  init(sbot, config) {
    return {
      create(opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        if (typeof opts === 'string')   { opts = { name: opts } }
        if (!opts) opts = {}

        sbot.publish({ type: 'git-repo', name: opts.name || undefined }, (err, msg) => {
          if (err) return cb(err)
          const host = (config.decent && config.decent.host) || '127.0.0.1'
          const port = (config.decent && config.decent.port) || 8888
          const url  = 'http://' + host + ':' + port + '/git/' + encodeURIComponent(msg.key)
          cb(null, url)
        })
      }
    }
  }
}

// Called from decent-ui.js to handle /git/* requests.
// Returns true if the request was handled, false otherwise.
module.exports.handleGitRequest = function (sbot, req, res) {
  const match = parseGitRoute(req)
  if (!match) return false

  const { repoId, endpoint, service } = match

  if (endpoint === 'info/refs') {
    handleInfoRefs(sbot, repoId, service, res)
  } else if (endpoint === 'git-upload-pack') {
    if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return true }
    handleUploadPack(sbot, repoId, req, res)
  } else if (endpoint === 'git-receive-pack') {
    if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return true }
    handleReceivePack(sbot, repoId, req, res)
  }

  return true
}
