'use strict'

// Git smart HTTP server plugin for SSB.
//
// Implements git smart HTTP protocol endpoints:
//   GET  /git/:repoId/info/refs?service=git-upload-pack   (clone/fetch refs)
//   POST /git/:repoId/git-upload-pack                     (clone/fetch pack)
//   GET  /git/:repoId/info/refs?service=git-receive-pack  (push refs)
//   POST /git/:repoId/git-receive-pack                    (push pack)
//
// JSON read-only API:
//   GET  /git/:repoId/json/refs
//   GET  /git/:repoId/json/log/:ref
//   GET  /git/:repoId/json/commit/:sha1
//   GET  /git/:repoId/json/tree/:ref[/:path...]
//   GET  /git/:repoId/json/blob/:ref/:path...
//   GET  /git/:repoId/json/history/:ref/:path...   (native git log -- path)
//   GET  /git/:repoId/json/blame/:ref/:path...     (native git blame)
//
// SSB RPC:
//   git.create(name, cb) → HTTP URL for the new repo

const pull      = require('pull-stream')
const paramap   = require('pull-paramap')
const cat       = require('pull-cat')
const cache     = require('pull-cache')
const fs        = require('fs')
const os        = require('os')
const path      = require('path')
const cp        = require('child_process')
const toPull    = require('stream-to-pull-stream')
const gitRepo   = require('ssb-git-repo')
const GitRepo   = require('pull-git-repo')
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

function sidebandPkts(band, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
  const maxPayload = 65515
  const packets = []

  for (let i = 0; i < payload.length; i += maxPayload) {
    packets.push(sidebandPkt(band, payload.slice(i, i + maxPayload)))
  }

  return packets.length ? packets : [sidebandPkt(band, Buffer.alloc(0))]
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

function buildReceivePackResult(refNames, err, useSideband) {
  const status = []
  if (err) {
    status.push(pktLine('unpack ' + err.message + '\n'))
  } else {
    status.push(pktLine('unpack ok\n'))
    refNames.forEach(name => status.push(pktLine(`ok ${name}\n`)))
  }

  status.push(FLUSH)

  if (useSideband) {
    return [sidebandPkt(0x01, Buffer.concat(status)), FLUSH]
  }

  return status
}

function execFileBuffer(file, args, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }

  const input = opts.input
  const child = cp.spawn(file, args, Object.assign({
    stdio: ['pipe', 'pipe', 'pipe']
  }, opts, { input: undefined }))

  const stdout = []
  const stderr = []

  child.stdout.on('data', chunk => stdout.push(chunk))
  child.stderr.on('data', chunk => stderr.push(chunk))
  child.on('error', cb)

  if (input != null) child.stdin.end(input)
  else child.stdin.end()

  child.on('close', code => {
    const out = Buffer.concat(stdout)
    const errOut = Buffer.concat(stderr)
    if (code) {
      const err = new Error(errOut.toString('utf8').trim() || (file + ' returned ' + code))
      err.stdout = out
      err.stderr = errOut
      return cb(err)
    }
    cb(null, out, errOut)
  })
}

function cleanupDir(dir, cb) {
  fs.rm(dir, { recursive: true, force: true }, () => cb && cb())
}

// ── on-disk materialization (for native git log/blame) ───────────────────────
//
// The JSON read API normally reads git objects straight from SSB blobs. A few
// queries — per-path history and blame — are far simpler and more correct to
// answer with native `git`, which needs the objects on disk. materializeRepo
// reconstructs a real bare repo in a temp dir by pulling the repo's full pack
// (the same pack clone uses) through `git unpack-objects`.
//
// Results are cached per repo and keyed on the current ref set, so a push
// (which changes a ref hash) transparently invalidates the cache. Refs are not
// written into the temp repo; callers resolve a ref to a commit sha in JS and
// pass that sha to git, which is enough for log/blame.

const materializedRepos   = new Map() // repoId -> { key, dir }
const materializeInFlight  = new Map() // repoId -> [cb, …]
const materializeTempDirs  = new Set()

process.once('exit', () => {
  for (const dir of materializeTempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
})

function refsCacheKey(refs) {
  return refs
    .map(r => r.name + ':' + r.hash)
    .sort()
    .join('\n')
}

function materializeRepo(sbot, repoId, cb) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) return cb(err)
    GitRepo(repo)
    collectRefs(repo, (err, refs) => {
      if (err) return cb(err)
      if (!refs || !refs.length) return cb(new Error('repository has no refs'))

      const key    = refsCacheKey(refs)
      const cached  = materializedRepos.get(repoId)
      if (cached && cached.key === key && fs.existsSync(cached.dir)) {
        return cb(null, cached.dir, repo)
      }

      // Coalesce concurrent materializations of the same repo.
      const waiters = materializeInFlight.get(repoId)
      if (waiters) { waiters.push({ cb, repo }); return }
      materializeInFlight.set(repoId, [])

      function finish(err, dir) {
        const queued = materializeInFlight.get(repoId) || []
        materializeInFlight.delete(repoId)
        cb(err, dir, repo)
        for (const w of queued) w.cb(err, dir, w.repo)
      }

      fs.mkdtemp(path.join(os.tmpdir(), 'ssbc-git-materialize-'), (err, dir) => {
        if (err) return finish(err)
        materializeTempDirs.add(dir)

        execFileBuffer('git', ['init', '--bare', '-q', dir], (err) => {
          if (err) { cleanupDir(dir); materializeTempDirs.delete(dir); return finish(err) }

          const wants = {}
          refs.forEach(r => { if (r.hash) wants[r.hash] = true })

          repo.getPack(wants, {}, {}, (err, packStream) => {
            if (err) { cleanupDir(dir); materializeTempDirs.delete(dir); return finish(err) }

            const child = cp.spawn('git', ['unpack-objects', '-q'], {
              cwd: dir,
              env: Object.assign({}, process.env, { GIT_DIR: dir }),
              stdio: ['pipe', 'ignore', 'pipe']
            })
            let stderr = Buffer.alloc(0)
            child.stderr.on('data', c => { stderr = Buffer.concat([stderr, c]) })
            child.on('error', err => { cleanupDir(dir); materializeTempDirs.delete(dir); finish(err) })
            child.on('close', code => {
              if (code) {
                cleanupDir(dir); materializeTempDirs.delete(dir)
                return finish(new Error('git unpack-objects: ' +
                  (stderr.toString('utf8').trim() || ('exit ' + code))))
              }
              const old = materializedRepos.get(repoId)
              materializedRepos.set(repoId, { key, dir })
              if (old && old.dir && old.dir !== dir) {
                materializeTempDirs.delete(old.dir)
                cleanupDir(old.dir)
              }
              finish(null, dir)
            })

            pull(packStream, toPull.sink(child.stdin, () => {}))
          })
        })
      })
    })
  })
}

// Parse `git blame --porcelain` output into per-line attribution records.
function parseBlamePorcelain(text) {
  const lines   = text.split('\n')
  const commits = {} // sha -> { author, email, time, summary }
  const out     = []
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/)
    if (!m) { i++; continue }
    const sha       = m[1]
    const finalLine = parseInt(m[2], 10)
    i++
    const c = commits[sha] || (commits[sha] = {})
    while (i < lines.length && lines[i][0] !== '\t') {
      const line = lines[i]
      const sp   = line.indexOf(' ')
      const k    = sp === -1 ? line : line.slice(0, sp)
      const v    = sp === -1 ? ''   : line.slice(sp + 1)
      if      (k === 'author')      c.author  = v
      else if (k === 'author-mail') c.email   = v.replace(/^<|>$/g, '')
      else if (k === 'author-time') c.time    = parseInt(v, 10)
      else if (k === 'summary')     c.summary = v
      i++
    }
    const content = (i < lines.length && lines[i][0] === '\t') ? lines[i].slice(1) : ''
    i++
    out.push({
      line:    finalLine,
      sha1:    sha,
      content: content,
      author:  c.author  || '',
      email:   c.email   || '',
      date:    c.time ? new Date(c.time * 1000).toISOString() : null,
      summary: c.summary || ''
    })
  }
  return out
}


// Validate and index an incoming receive-pack packfile, then return pull-stream
// sources for the pack and index suitable for storage as SSB blobs.
//
// We advertise `no-thin` in our capabilities so git clients send complete packs
// (no missing delta bases). `git index-pack` validates the pack and writes the
// index without needing any existing repo context.
//
// Previous implementation ran `git pack-objects --all` which traverses the full
// commit graph from the new refs. That blew up because parent commits live in
// SSB blobs, not in the temp dir. We now use the index-pack output directly —
// no unpack-objects, no repack, no graph traversal.
function normalizeReceivePack(packBuf, updates, cb) {
  fs.mkdtemp(path.join(os.tmpdir(), 'ssbc-git-receive-pack-'), (err, tmpDir) => {
    if (err) return cb(err)

    const fixedIdx  = path.join(tmpDir, 'incoming.idx')
    const fixedPack = path.join(tmpDir, 'incoming.pack')

    function done(err, idxStream, packStream, objectIds) {
      if (err) return cleanupDir(tmpDir, () => cb(err))
      cb(null, idxStream, packStream, objectIds, () => cleanupDir(tmpDir))
    }

    const indexPackProc = cp.spawn('git', [
      'index-pack', '--stdin', '-o', fixedIdx, fixedPack
    ], { stdio: ['pipe', 'ignore', 'pipe'] })

    let stderr = Buffer.alloc(0)
    indexPackProc.stderr.on('data', chunk => { stderr = Buffer.concat([stderr, chunk]) })
    indexPackProc.on('error', done)
    indexPackProc.stdin.on('error', () => {})
    indexPackProc.stdin.end(packBuf)

    indexPackProc.on('close', code => {
      if (code) {
        const msg = stderr.toString('utf8').trim() || ('git index-pack returned ' + code)
        return done(new Error(msg))
      }

      fs.readFile(fixedPack, (packReadErr, packBuf) => {
        if (packReadErr) return done(packReadErr)

        fs.readFile(fixedIdx, (idxReadErr, idxBuf) => {
          if (idxReadErr) return done(idxReadErr)

          execFileBuffer('git', ['show-index'], { input: idxBuf }, (showIdxErr, stdout) => {
            if (showIdxErr) return done(showIdxErr)

            const objectIds = stdout.toString('utf8')
              .trim().split('\n').filter(Boolean)
              .map(line => line.trim().split(/\s+/)[1]).filter(Boolean)

            done(null, bufToPull(idxBuf), bufToPull(packBuf), objectIds)
          })
        })
      })
    })
  })
}

function collectBlobLink(repo, read, cb) {
  pull(read, repo.addSSBBlob(cb))
}

function publishReceivePackUpdate(repo, updates, idxStream, packStream, objectIds, cb) {
  const packCached = cache(packStream)
  const refs = {}

  updates.forEach(update => {
    refs[update.name] = update.new
  })

  let packLink
  let idxLink
  let finished = false

  function isNoOp(currentByName) {
    return updates.every(u => {
      const current = currentByName[u.name]
      if (u.new === null) return !current
      return current === u.new
    })
  }

  // Decide what HEAD should point to after this push. Git's smart-HTTP push
  // protocol never transmits HEAD, so the receiving end has to set it: keep the
  // existing HEAD if its branch survives the push, otherwise adopt the first
  // branch pushed (as git does on an initial push). Without this, ssb-git falls
  // back to a heuristic that prefers refs/heads/master and otherwise picks an
  // arbitrary branch, so the forge shows the wrong default branch.
  function resolveHead(currentByName, currentHead) {
    const isBranch = name => /^refs\/heads\//.test(name)
    const live = {}
    Object.keys(currentByName).forEach(name => { live[name] = true })
    updates.forEach(u => {
      if (u.new === null) delete live[u.name]
      else live[u.name] = true
    })
    if (currentHead && isBranch(currentHead) && live[currentHead]) return currentHead
    const pushed = updates
      .filter(u => isBranch(u.name) && u.new !== null)
      .map(u => u.name)[0]
    if (pushed) return pushed
    return Object.keys(live).filter(isBranch)[0]
  }

  function complete(err) {
    if (finished) return
    if (err) {
      finished = true
      return cb(err)
    }
    if (!packLink || !idxLink) return

    pull(repo.refs(), pull.collect((refsErr, currentRefs) => {
      if (refsErr) return cb(refsErr)
      const currentByName = {}
      currentRefs.forEach(r => { currentByName[r.name] = r.hash })
      if (isNoOp(currentByName)) {
        console.error('git-server: push is already up-to-date; skipping publish')
        return cb(null)
      }
      repo.getHead((headErr, currentHead) => {
        if (headErr) return cb(headErr)
        buildAndPublish(resolveHead(currentByName, currentHead))
      })
    }))
  }

  function buildAndPublish(head) {
    const msg = {
      type: 'git-update',
      recps: repo.recps,
      repo: repo.id,
      refs,
      head: head || undefined,
      packs: [packLink],
      indexes: [idxLink],
      num_objects: objectIds.length || undefined,
      object_ids: objectIds.length ? objectIds : undefined
    }

    function publish(value) {
      const publishFn = repo.recps
        ? repo.sbot.private.publish.bind(repo.sbot.private, value, repo.recps)
        : repo.sbot.publish.bind(repo.sbot, value)

      publishFn((err, publishedMsg) => {
        if (err) {
          if (/must not be large/.test(err.message) && value.object_ids) {
            const smaller = Object.assign({}, value)
            delete smaller.object_ids
            delete smaller.num_objects
            return publish(smaller)
          }
          return cb(err)
        }

        repo._processNewMsg(publishedMsg)
        cb(null)
      })
    }

    if (!repo.sbot.blobs.push) return publish(msg)

    console.error('Pushing blobs...')
    repo.sbot.blobs.push(packLink.link, err => {
      if (err) return cb(err)
      repo.sbot.blobs.push(idxLink.link, err => {
        if (err) return cb(err)
        publish(msg)
      })
    })
  }

  collectBlobLink(repo, packCached(), (err, link) => {
    if (err) return complete(err)
    packLink = link
    complete()
  })

  collectBlobLink(repo, idxStream, (err, link) => {
    if (err) return complete(err)
    idxLink = link
    complete()
  })
}

// Build the full ref advertisement body for an info/refs response.
// refs:    [{name, hash}]
// symrefs: [{name, ref}]  (e.g. {name:'HEAD', ref:'refs/heads/master'})
function buildRefAdvert(service, refs, symrefs) {
  const caps = service === 'git-upload-pack'
    ? ['multi_ack_detailed', 'no-done', 'side-band-64k', 'thin-pack', 'ofs-delta', 'no-progress', 'include-tag']
    : ['report-status', 'report-status-v2', 'delete-refs', 'side-band-64k', 'no-thin', 'quiet', 'ofs-delta']

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

function parseCreateOpts(opts) {
  if (typeof opts === 'function' || opts == null) return {}

  if (typeof opts === 'string') {
    const trimmed = opts.trim()
    if (trimmed[0] === '{' || trimmed[0] === '[') {
      try {
        opts = JSON.parse(trimmed)
      } catch (_) {
        opts = { name: opts }
      }
    } else {
      opts = { name: opts }
    }
  }

  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) return {}
  return opts
}

// ── Raw blob endpoint ─────────────────────────────────────────────────────────

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
  pdf: 'application/pdf', wasm: 'application/wasm',
  js: 'text/javascript', ts: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', css: 'text/css',
  html: 'text/html', xml: 'text/xml', svg: 'image/svg+xml',
  txt: 'text/plain', md: 'text/plain',
  sh: 'text/plain', py: 'text/plain', rb: 'text/plain', go: 'text/plain',
  rs: 'text/plain', c: 'text/plain', h: 'text/plain', cpp: 'text/plain'
}

function mimeForPath(filePath) {
  const ext = (filePath[filePath.length - 1] || '').match(/\.(\w+)$/)
  return ext ? (MIME[ext[1].toLowerCase()] || 'application/octet-stream') : 'application/octet-stream'
}

function handleRawBlob(sbot, repoId, ref, filePath, res) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) { res.statusCode = 404; res.end('Repository not found'); return }
    GitRepo(repo)
    repo.resolveRef(ref, (err, hash) => {
      if (err) { res.statusCode = 404; res.end('Ref not found'); return }
      repo.getCommitParsed(hash, (err, commit) => {
        if (err) { res.statusCode = 404; res.end('Commit not found'); return }
        repo.getFile(commit.tree, filePath, (err, file) => {
          if (err) { res.statusCode = 404; res.end('File not found'); return }
          const ct = mimeForPath(filePath)
          res.writeHead(200, {
            'Content-Type': ct,
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
          })
          pull(file.read, pull.drain(
            chunk => res.write(chunk),
            err2 => { if (err2 && err2 !== true) console.error('raw blob error:', err2); res.end() }
          ))
        })
      })
    })
  })
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
          chunk => sidebandPkts(0x01, chunk).forEach(buf => res.write(buf)),
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
    const requestedCaps = new Set()
    if (lines[0]) {
      const nullIdx = lines[0].indexOf('\0')
      if (nullIdx !== -1) {
        lines[0].slice(nullIdx + 1).trim().split(/\s+/).filter(Boolean).forEach(cap => {
          requestedCaps.add(cap)
        })
      }
    }

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
      const useSideband = requestedCaps.has('side-band-64k')

      function sendResult(err) {
        res.writeHead(200, {
          'Content-Type': 'application/x-git-receive-pack-result',
          'Cache-Control': 'no-cache'
        })
        buildReceivePackResult(refNames, err, useSideband).forEach(buf => res.write(buf))

        res.end()
      }

      if (updates.length === 0) return sendResult(null)

      if (!hasPack) {
        repo.uploadPack(pull.values(updates), pull.empty(), sendResult)
        return
      }

      normalizeReceivePack(rest, updates, (err, idxStream, packfileFixed, objectIds, cleanup) => {
        if (err) return sendResult(new Error('index-pack failed: ' + err.message))
        publishReceivePackUpdate(repo, updates, idxStream, pull(
          packfileFixed,
          pull.filter(buf => buf.length)
        ), objectIds, err => {
          if (cleanup) cleanup()
          sendResult(err)
        })
      })
    })
  })
}

// ── JSON API helpers ──────────────────────────────────────────────────────────

function collectStream(read, cb) {
  pull(read, pull.collect(function (err, bufs) {
    if (err) return cb(err)
    cb(null, Buffer.concat(bufs))
  }))
}

function sendJson(res, obj) {
  const json = JSON.stringify(obj)
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(json)
}

function jsonErr(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: msg }))
}

// ── JSON route handlers ───────────────────────────────────────────────────────

function handleJsonRefs(sbot, repoId, res) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) return jsonErr(res, 404, 'Repository not found')
    GitRepo(repo)
    collectRefs(repo, (err, refs, symrefs) => {
      if (err) return jsonErr(res, 500, err.message)
      sendJson(res, { refs, symrefs })
    })
  })
}

function handleJsonLog(sbot, repoId, ref, res) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) return jsonErr(res, 404, 'Repository not found')
    GitRepo(repo)
    repo.resolveRef(ref, (err, hash) => {
      if (err) return sendJson(res, { commits: [] })
      pull(
        repo.readLog(hash),
        pull.take(30),
        paramap((sha1, cb) => {
          repo.getCommitParsed(sha1, (err, commit) => {
            if (err) return cb(null, null)
            cb(null, {
              sha1,
              title: commit.title || '',
              body:  commit.body  || '',
              author: {
                name:  commit.author.name  || '',
                email: commit.author.email || '',
                date:  commit.author.date ? commit.author.date.toISOString() : null
              },
              parents: commit.parents || []
            })
          })
        }, 4),
        pull.filter(Boolean),
        pull.collect((err, commits) => {
          if (err) return jsonErr(res, 500, err.message)
          sendJson(res, { ref, commits })
        })
      )
    })
  })
}

// Per-path commit history: native `git log <sha> -- <path>` against a
// materialized copy of the repo.
function handleJsonHistory(sbot, repoId, ref, filePath, res) {
  const pathStr = (filePath || []).join('/')
  if (!pathStr) return jsonErr(res, 400, 'Path required')

  materializeRepo(sbot, repoId, (err, dir, repo) => {
    if (err) return jsonErr(res, 404, 'Repository not available: ' + err.message)
    repo.resolveRef(ref, (err, sha) => {
      if (err || !sha) return jsonErr(res, 404, 'Ref not found: ' + ref)

      const FIELD = '\x1f' // unit separator between commit fields
      const REC   = '\x1e' // record separator between commits
      const fmt   = ['%H', '%an', '%ae', '%aI', '%s', '%b'].join(FIELD) + REC
      const args  = [
        '-C', dir, 'log', '--no-color', '--max-count=200',
        '--pretty=format:' + fmt, sha, '--', pathStr
      ]
      execFileBuffer('git', args, (err, out) => {
        if (err) return jsonErr(res, 500, err.message)
        const commits = out.toString('utf8')
          .split(REC)
          .map(rec => rec.replace(/^\n/, ''))
          .filter(Boolean)
          .map(rec => {
            const f = rec.split(FIELD)
            return {
              sha1:   f[0] || '',
              title:  f[4] || '',
              body:   f[5] || '',
              author: { name: f[1] || '', email: f[2] || '', date: f[3] || null }
            }
          })
        sendJson(res, { ref, path: pathStr, commits })
      })
    })
  })
}

// Per-line blame: native `git blame --porcelain <sha> -- <path>` against a
// materialized copy of the repo.
function handleJsonBlame(sbot, repoId, ref, filePath, res) {
  const pathStr = (filePath || []).join('/')
  if (!pathStr) return jsonErr(res, 400, 'Path required')

  materializeRepo(sbot, repoId, (err, dir, repo) => {
    if (err) return jsonErr(res, 404, 'Repository not available: ' + err.message)
    repo.resolveRef(ref, (err, sha) => {
      if (err || !sha) return jsonErr(res, 404, 'Ref not found: ' + ref)

      const args = ['-C', dir, 'blame', '--porcelain', sha, '--', pathStr]
      execFileBuffer('git', args, (err, out) => {
        if (err) return jsonErr(res, 500, err.message)
        sendJson(res, { ref, path: pathStr, lines: parseBlamePorcelain(out.toString('utf8')) })
      })
    })
  })
}

function handleJsonCommit(sbot, repoId, sha1, res) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) return jsonErr(res, 404, 'Repository not found')
    GitRepo(repo)
    repo.getCommitParsed(sha1, (err, commit) => {
      if (err) return jsonErr(res, 404, 'Commit not found')

      // Try to get changed files vs first parent
      const parentHash = commit.parents && commit.parents[0]
      if (!parentHash || !commit.tree) {
        return sendJson(res, {
          sha1, title: commit.title || '', body: commit.body || '',
          author:    { name: commit.author.name || '',    email: commit.author.email || '',    date: commit.author.date    ? commit.author.date.toISOString()    : null },
          committer: { name: commit.committer.name || '', email: commit.committer.email || '', date: commit.committer.date ? commit.committer.date.toISOString() : null },
          tree: commit.tree || '', parents: commit.parents || [], files: []
        })
      }

      repo.getCommitParsed(parentHash, (err, parentCommit) => {
        const parentTree = err ? null : parentCommit.tree
        const treeIds = parentTree
          ? [parentTree, commit.tree]
          : [commit.tree, commit.tree]

        pull(
          repo.diffTrees(treeIds, true),
          pull.collect((err, diffs) => {
            const files = err ? [] : diffs.map(d => ({
              path: (d.path || []).join('/'),
              id:   d.id   || null,
              mode: d.mode || null
            }))
            sendJson(res, {
              sha1, title: commit.title || '', body: commit.body || '',
              author:    { name: commit.author.name || '',    email: commit.author.email || '',    date: commit.author.date    ? commit.author.date.toISOString()    : null },
              committer: { name: commit.committer.name || '', email: commit.committer.email || '', date: commit.committer.date ? commit.committer.date.toISOString() : null },
              tree: commit.tree, parents: commit.parents || [], files
            })
          })
        )
      })
    })
  })
}

function handleJsonTree(sbot, repoId, ref, filePath, res) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) return jsonErr(res, 404, 'Repository not found')
    GitRepo(repo)
    repo.resolveRef(ref, (err, hash) => {
      if (err) return jsonErr(res, 404, 'Ref not found: ' + ref)
      repo.getCommitParsed(hash, (err, commit) => {
        if (err) return jsonErr(res, 404, 'Commit not found')
        const treeHash = commit.tree
        if (!treeHash) return jsonErr(res, 404, 'No tree')
        pull(
          repo.readDir(treeHash, filePath.length ? filePath : []),
          pull.collect((err, entries) => {
            if (err) return jsonErr(res, 404, err.message)
            const sorted = entries.slice().sort((a, b) => {
              const aDir = (a.mode === 0o040000)
              const bDir = (b.mode === 0o040000)
              if (aDir && !bDir) return -1
              if (!aDir && bDir) return 1
              return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
            })
            sendJson(res, {
              ref, path: filePath.join('/'),
              entries: sorted.map(e => ({
                name: e.name, id: e.id, mode: e.mode,
                isDir: (e.mode === 0o040000)
              }))
            })
          })
        )
      })
    })
  })
}

function handleJsonBlob(sbot, repoId, ref, filePath, res) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) return jsonErr(res, 404, 'Repository not found')
    GitRepo(repo)
    repo.resolveRef(ref, (err, hash) => {
      if (err) return jsonErr(res, 404, 'Ref not found: ' + ref)
      repo.getCommitParsed(hash, (err, commit) => {
        if (err) return jsonErr(res, 404, 'Commit not found')
        repo.getFile(commit.tree, filePath, (err, file) => {
          if (err) return jsonErr(res, 404, err.message)
          collectStream(file.read, (err, buf) => {
            if (err) return jsonErr(res, 500, err.message)
            sendJson(res, {
              ref, path: filePath.join('/'),
              content: buf.toString('utf8'),
              length: file.length, mode: file.mode
            })
          })
        })
      })
    })
  })
}

// ── LCS diff engine ───────────────────────────────────────────────────────────

// Myers-style O(N) space diff using dynamic programming.
// Returns array of {type:'equal'|'del'|'add', text:string}.
function lcsDiff(a, b) {
  const m = a.length
  const n = b.length
  // Build LCS length table
  const dp = new Array(m + 1)
  for (let i = 0; i <= m; i++) { dp[i] = new Uint32Array(n + 1) }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  // Backtrack
  const result = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'equal', text: a[i - 1] }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: b[j - 1] }); j--
    } else {
      result.push({ type: 'del', text: a[i - 1] }); i--
    }
  }
  result.reverse()
  return result
}

// Group flat line changes into hunks with `ctx` context lines on each side.
function toHunks(changes, ctx) {
  const hunks = []
  let hunk = null
  let oldLine = 1, newLine = 1

  function flushHunk() {
    if (!hunk) return
    // Trim trailing context
    while (hunk.lines.length > 0 && hunk.lines[hunk.lines.length - 1].type === 'equal')
      hunk.lines.pop()
    if (hunk.lines.some(l => l.type !== 'equal')) hunks.push(hunk)
    hunk = null
  }

  let pending = [] // pending equal lines (potential context)

  for (const ch of changes) {
    if (ch.type === 'equal') {
      if (hunk) {
        // Part of existing hunk's trailing context
        hunk.lines.push({ type: 'equal', text: ch.text, oldLn: oldLine, newLn: newLine })
        if (hunk.lines.filter(l => l.type === 'equal').length > ctx * 2) {
          flushHunk()
          pending = hunk ? hunk.lines.slice(-ctx) : []
        }
      } else {
        pending.push({ type: 'equal', text: ch.text, oldLn: oldLine, newLn: newLine })
        if (pending.length > ctx) pending.shift()
      }
      oldLine++; newLine++
    } else {
      if (!hunk) {
        hunk = { oldStart: oldLine - pending.length, newStart: newLine - pending.length, lines: pending.slice() }
        pending = []
      }
      if (ch.type === 'del') {
        hunk.lines.push({ type: 'del', text: ch.text, oldLn: oldLine })
        oldLine++
      } else {
        hunk.lines.push({ type: 'add', text: ch.text, newLn: newLine })
        newLine++
      }
    }
  }
  flushHunk()
  return hunks
}

function getBlobContent(repo, blobId, cb) {
  if (!blobId) return cb(null, '')
  repo.getObjectFromAny(blobId, (err, obj) => {
    if (err || !obj || obj.type !== 'blob') return cb(null, '')
    collectStream(obj.read, (err, buf) => cb(err, err ? '' : buf.toString('utf8')))
  })
}

function isBinary(str) {
  // Heuristic: if >10% non-printable bytes, treat as binary
  let nonPrint = 0
  for (let i = 0; i < Math.min(str.length, 512); i++) {
    const c = str.charCodeAt(i)
    if (c === 0 || (c < 9) || (c > 13 && c < 32)) nonPrint++
  }
  return nonPrint / Math.min(str.length, 512) > 0.1
}

function handleJsonDiff(sbot, repoId, sha1, res) {
  gitRepo.getRepo(sbot, repoId, {}, (err, repo) => {
    if (err) return jsonErr(res, 404, 'Repository not found')
    GitRepo(repo)

    repo.getCommitParsed(sha1, (err, commit) => {
      if (err) return jsonErr(res, 404, 'Commit not found')

      const parentHash = commit.parents && commit.parents[0]

      function doDiff(parentTree) {
        const treeIds = parentTree ? [parentTree, commit.tree] : [commit.tree, commit.tree]

        pull(
          repo.diffTrees(treeIds, true),
          pull.filter(d => d.id),  // only files with id changes (not just mode)
          pull.take(30),
          paramap((diff, cb) => {
            const path = (diff.path || []).join('/')
            // id: {0: oldBlobId, 1: newBlobId}, undefined = not present in that tree
            const oldId = diff.id && diff.id[0]
            const newId = diff.id && diff.id[1]
            const status = !oldId ? 'added' : !newId ? 'deleted' : 'modified'

            // Fetch both blobs in parallel
            let oldText = '', newText = '', pending = 2
            function done() {
              if (--pending) return
              if (isBinary(oldText) || isBinary(newText)) {
                return cb(null, { path, status, binary: true, hunks: [] })
              }
              const a = oldText ? oldText.split('\n') : []
              const b = newText ? newText.split('\n') : []
              // Limit diff size
              const aT = a.slice(0, 400)
              const bT = b.slice(0, 400)
              const changes = lcsDiff(aT, bT)
              const hunks = toHunks(changes, 3)
              cb(null, { path, status, binary: false, truncated: a.length > 400 || b.length > 400, hunks })
            }
            getBlobContent(repo, oldId, (err, t) => { oldText = t || ''; done() })
            getBlobContent(repo, newId, (err, t) => { newText = t || ''; done() })
          }, 4),
          pull.filter(Boolean),
          pull.collect((err, files) => {
            if (err) return jsonErr(res, 500, err.message)
            sendJson(res, { sha1, title: commit.title, files })
          })
        )
      }

      if (!parentHash) return doDiff(null)
      repo.getCommitParsed(parentHash, (err, p) => doDiff(err ? null : p.tree))
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

// Returns null if not a JSON route; otherwise { repoId, sub, ref, path, sha1 }.
function parseJsonRoute(req) {
  const raw      = req.url || '/'
  const qIdx     = raw.indexOf('?')
  const pathname = qIdx === -1 ? raw : raw.slice(0, qIdx)

  const m = pathname.match(/^\/git\/([^/]+)\/json\/(.*)$/)
  if (!m) return null

  let repoId
  try { repoId = decodeURIComponent(m[1]) } catch (_) { return null }

  const rest = m[2]

  if (rest === 'refs') return { repoId, sub: 'refs' }

  const parts = rest.split('/')
  if (parts[0] === 'log'    && parts.length >= 2) {
    let ref = parts.slice(1).join('/')
    try { ref = decodeURIComponent(ref) } catch (_) {}
    return { repoId, sub: 'log', ref: ref }
  }
  if (parts[0] === 'commit' && parts.length === 2) return { repoId, sub: 'commit', sha1: parts[1] }
  if (parts[0] === 'diff'   && parts.length === 2) return { repoId, sub: 'diff',   sha1: parts[1] }
  if (parts[0] === 'history' && parts.length >= 3) {
    let ref
    try { ref = decodeURIComponent(parts[1]) } catch (_) { ref = parts[1] }
    return { repoId, sub: 'history', ref: ref, path: parts.slice(2) }
  }
  if (parts[0] === 'blame'  && parts.length >= 3) {
    let ref
    try { ref = decodeURIComponent(parts[1]) } catch (_) { ref = parts[1] }
    return { repoId, sub: 'blame', ref: ref, path: parts.slice(2) }
  }
  if (parts[0] === 'tree'   && parts.length >= 2) {
    let ref
    try { ref = decodeURIComponent(parts[1]) } catch (_) { ref = parts[1] }
    return { repoId, sub: 'tree', ref: ref, path: parts.slice(2) }
  }
  if (parts[0] === 'blob'   && parts.length >= 3) {
    let ref
    try { ref = decodeURIComponent(parts[1]) } catch (_) { ref = parts[1] }
    return { repoId, sub: 'blob', ref: ref, path: parts.slice(2) }
  }

  return null
}

// Returns null if not a raw blob route; otherwise { repoId, ref, path }.
function parseRawRoute(req) {
  const raw      = req.url || '/'
  const qIdx     = raw.indexOf('?')
  const pathname = qIdx === -1 ? raw : raw.slice(0, qIdx)

  const m = pathname.match(/^\/git\/([^/]+)\/raw\/([^/]+)\/(.+)$/)
  if (!m) return null

  let repoId
  try { repoId = decodeURIComponent(m[1]) } catch (_) { return null }

  const ref  = decodeURIComponent(m[2])
  const path = m[3].split('/').map(p => { try { return decodeURIComponent(p) } catch (_) { return p } })

  return { repoId, ref, path }
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
        opts = parseCreateOpts(opts)

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
  // Try JSON API routes first (GET only, no auth needed)
  if (req.method === 'GET' || req.method === 'HEAD') {
    const json = parseJsonRoute(req)
    if (json) {
      if (req.method === 'HEAD') { res.writeHead(200); res.end(); return true }
      const { repoId, sub, ref, path, sha1 } = json
      if (sub === 'refs')        handleJsonRefs(sbot, repoId, res)
      else if (sub === 'log')    handleJsonLog(sbot, repoId, ref, res)
      else if (sub === 'commit') handleJsonCommit(sbot, repoId, sha1, res)
      else if (sub === 'diff')   handleJsonDiff(sbot, repoId, sha1, res)
      else if (sub === 'tree')   handleJsonTree(sbot, repoId, ref, path || [], res)
      else if (sub === 'blob')   handleJsonBlob(sbot, repoId, ref, path || [], res)
      else if (sub === 'history') handleJsonHistory(sbot, repoId, ref, path || [], res)
      else if (sub === 'blame')   handleJsonBlame(sbot, repoId, ref, path || [], res)
      return true
    }

    const raw = parseRawRoute(req)
    if (raw) {
      if (req.method === 'HEAD') { res.writeHead(200); res.end(); return true }
      handleRawBlob(sbot, raw.repoId, raw.ref, raw.path, res)
      return true
    }
  }

  // Git smart HTTP protocol routes
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

module.exports._test = {
  buildRefAdvert,
  parsePktLines,
  buildReceivePackResult,
  sidebandPkts
}
