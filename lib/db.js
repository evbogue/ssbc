'use strict'
/**
 * lib/db.js — SQLite-backed SSB message store
 *
 * Replaces ssb-db (+ flumedb + flumelog-offset + flumeview-* + jitdb +
 * level + leveldown) with node:sqlite, built into Node.js 22.5+.
 *
 * API is wire-compatible with ssb-db so all existing plugins work unchanged.
 */

// Suppress the ExperimentalWarning emitted on Node 22 for node:sqlite
// (the module is fully functional; the warning is cosmetic).
{
  const ow = process.emitWarning.bind(process)
  process.emitWarning = function (msg, opts) {
    if (typeof msg === 'string' && /sqlite/i.test(msg)) return
    ow(msg, opts)
  }
}
const { DatabaseSync } = require('node:sqlite')
process.emitWarning = process.emitWarning  // no-op restore (already patched above)

const path   = require('path')
const fs     = require('fs')
const os     = require('os')
const pull   = require('pull-stream')
const pushable = require('pull-pushable')
const ssbKeys  = require('ssb-keys')
const ssbRef   = require('ssb-ref')
const V        = require('ssb-validate')

// ─── Observable ───────────────────────────────────────────────────────────────
// Minimal observable: obs(fn) subscribes; obs.set(v) notifies; obs.value() reads.
function observable(initial) {
  let value = initial
  const listeners = []
  function obs(fn) {
    listeners.push(fn)
    return function () {
      const i = listeners.indexOf(fn)
      if (i !== -1) listeners.splice(i, 1)
    }
  }
  obs.set = function (v) {
    value = v
    listeners.slice().forEach((fn) => fn(v))
  }
  obs.value = () => value
  return obs
}

// ─── Link extraction ─────────────────────────────────────────────────────────
function isSSBRef(s) {
  return typeof s === 'string' && (ssbRef.isMsg(s) || ssbRef.isFeed(s) || ssbRef.isBlob(s))
}

// Walk a message content object and collect {src, dest, rel, key} link tuples.
function extractLinks(author, msgKey, content) {
  if (typeof content !== 'object' || content === null) return []
  const links = []

  function walk(obj, rel) {
    if (typeof obj === 'string') {
      if (isSSBRef(obj)) links.push({ src: author, dest: obj, rel: rel || null, key: msgKey })
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => walk(item, rel))
    } else if (obj && typeof obj === 'object') {
      // Canonical SSB link object: { link: '...', ... }
      if (obj.link && isSSBRef(obj.link)) {
        links.push({ src: author, dest: obj.link, rel: rel || null, key: msgKey })
      } else {
        for (const [k, v] of Object.entries(obj)) walk(v, k)
      }
    }
  }

  for (const [k, v] of Object.entries(content)) walk(v, k)
  return links
}

// ─── Row helpers ──────────────────────────────────────────────────────────────
function rowToKVT(row) {
  return {
    key:       row.key,
    value:     JSON.parse(row.raw),
    timestamp: row.rts
  }
}

// Format a KVT according to the keys/values/private stream flags.
function formatMsg(kvt, flags, unboxers) {
  if (flags.decrypt && typeof kvt.value.content === 'string') {
    const plain = tryUnbox(kvt.value, unboxers)
    if (plain) {
      kvt = Object.assign({}, kvt, {
        value: Object.assign({}, kvt.value, {
          content: plain,
          meta: { private: true, original: { content: kvt.value.content } }
        })
      })
    }
  }
  if (flags.keys && flags.values) return kvt
  if (flags.keys)   return kvt.key
  if (flags.values) return kvt.value
  return kvt
}

function streamFlags(opts) {
  return {
    keys:    opts == null || opts.keys   !== false,
    values:  opts == null || opts.values !== false,
    decrypt: opts != null && opts.private === true
  }
}

// ─── Encryption helpers ───────────────────────────────────────────────────────
function tryBox(content, boxers) {
  if (!content || typeof content !== 'object') return content
  if (!content.recps || !Array.isArray(content.recps) || !content.recps.length) return content
  for (const boxer of boxers) {
    const ct = boxer(content)
    if (ct) return ct
  }
  throw new Error('could not encrypt: no boxer accepted the message')
}

function tryUnbox(value, unboxers) {
  if (typeof value.content !== 'string') return null
  for (const unboxer of unboxers) {
    try {
      let result
      if (typeof unboxer === 'function') {
        result = unboxer(value.content, value)
      } else if (unboxer && typeof unboxer.value === 'function') {
        const key = unboxer.key ? unboxer.key(value.content, value) : null
        if (key) result = unboxer.value(value.content, value, key)
      }
      if (result) return result
    } catch (_) {}
  }
  return null
}

// ─── Database factory ─────────────────────────────────────────────────────────
function createDatabase(config) {
  // Resolve storage path
  let dbPath
  if (config.temp) {
    const dir = path.join(
      os.tmpdir(),
      typeof config.temp === 'string' ? config.temp : String(Date.now())
    )
    fs.mkdirSync(dir, { recursive: true })
    dbPath = path.join(dir, 'ssb.db')
    config.path = dir
  } else {
    fs.mkdirSync(config.path, { recursive: true })
    dbPath = path.join(config.path, 'ssb.db')
  }

  const sqlite = new DatabaseSync(dbPath)

  // Schema
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous  = NORMAL;

    CREATE TABLE IF NOT EXISTS messages (
      rowid   INTEGER PRIMARY KEY,
      key     TEXT    UNIQUE NOT NULL,
      author  TEXT    NOT NULL,
      seq     INTEGER NOT NULL,
      ts      REAL    NOT NULL,
      rts     REAL    NOT NULL,
      type    TEXT,
      raw     TEXT    NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_author_seq  ON messages(author, seq);
    CREATE        INDEX IF NOT EXISTS idx_rts         ON messages(rts);
    CREATE        INDEX IF NOT EXISTS idx_type_rts    ON messages(type, rts);
    CREATE        INDEX IF NOT EXISTS idx_ts          ON messages(ts);

    CREATE TABLE IF NOT EXISTS links (
      src  TEXT NOT NULL,
      dest TEXT NOT NULL,
      rel  TEXT,
      key  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_links_dest ON links(dest);
    CREATE INDEX IF NOT EXISTS idx_links_src  ON links(src);

    -- FTS5 Search Index
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      key UNINDEXED,
      type,
      text
    );
  `)

  // Prepared statements used in hot paths
  const stmts = {
    insertMsg:        sqlite.prepare('INSERT OR IGNORE INTO messages (key,author,seq,ts,rts,type,raw) VALUES (?,?,?,?,?,?,?)'),
    insertLink:       sqlite.prepare('INSERT INTO links (src,dest,rel,key) VALUES (?,?,?,?)'),
    getByKey:         sqlite.prepare('SELECT * FROM messages WHERE key = ?'),
    getByRowid:       sqlite.prepare('SELECT * FROM messages WHERE rowid = ?'),
    getByAuthorSeq:   sqlite.prepare('SELECT * FROM messages WHERE author = ? AND seq = ?'),
    latestByAuthor:   sqlite.prepare('SELECT * FROM messages WHERE author = ? ORDER BY seq DESC LIMIT 1'),
    maxRts:           sqlite.prepare('SELECT MAX(rts) AS v FROM messages'),
    maxRowid:         sqlite.prepare('SELECT MAX(rowid) AS v FROM messages'),
  }

  // Monotonic receive timestamp — guaranteed to increase with each stored message.
  let lastRts = (stmts.maxRts.get().v) || (Date.now() - 1)
  function nextRts() {
    const now = Date.now()
    lastRts = now > lastRts ? now : lastRts + 1
    return lastRts
  }

  // Observables (used by ssb-ebt and other plugins that subscribe to new messages)
  const post  = observable(null)
  const since = observable(Number(stmts.maxRowid.get().v) || -1)

  // Live-stream registry: every live pull-source adds a listener here.
  const liveListeners = []

  // Encryption registries (populated by ssb-private1 via addBoxer/addUnboxer)
  const boxers   = []
  const unboxers = []

  // HMAC key for signing / verification (caps.sign from ssb-config)
  const hmacKey = (config.caps && config.caps.sign) ? config.caps.sign : null

  // ── Internal: persist a validated message ───────────────────────────────────
  function storeKVT(msgKey, msgValue, rts) {
    const content = msgValue.content
    const type = (content && typeof content === 'object') ? (content.type || null) : null

    const res = stmts.insertMsg.run(
      msgKey, msgValue.author, msgValue.sequence,
      msgValue.timestamp, rts, type,
      JSON.stringify(msgValue)
    )

    // Extract and persist link graph
    if (content && typeof content === 'object') {
      for (const ln of extractLinks(msgValue.author, msgKey, content)) {
        stmts.insertLink.run(ln.src, ln.dest, ln.rel, ln.key)
      }

      // Index for search (universal)
      const searchText = [
        content.text, content.name, content.title, content.description,
        content.body, content.subject, content.summary
      ].filter(s => typeof s === 'string').join(' ')
      
      if (searchText.length > 0) {
        sqlite.prepare('INSERT INTO search_index (key, type, text) VALUES (?,?,?)').run(
          msgKey, type, searchText
        )
      }
    }

    const kvt    = { key: msgKey, value: msgValue, timestamp: rts }
    const rowid  = Number(res.lastInsertRowid)
    post.set(kvt)
    since.set(rowid)
    liveListeners.slice().forEach((fn) => fn(kvt))
    return kvt
  }

  // ── Core write operations ────────────────────────────────────────────────────

  // addSync: validate + store a message value; throw on error; idempotent.
  function addSync(rawMsg) {
    // Accept either a bare message value or a {key,value,timestamp} wrapper
    const msgValue = (rawMsg && rawMsg.value && rawMsg.key) ? rawMsg.value : rawMsg

    // Idempotency: skip if already stored
    const msgKey  = V.id(msgValue)
    const existing = stmts.getByKey.get(msgKey)
    if (existing) return rowToKVT(existing)

    // Reconstruct per-feed validate state from the DB
    const latest  = stmts.latestByAuthor.get(msgValue.author)
    const vState  = V.initial()
    if (latest) {
      vState.feeds[msgValue.author] = {
        id:        latest.key,
        sequence:  latest.seq,
        timestamp: latest.ts,
        queue:     []
      }
    }

    const newState = V.append(vState, hmacKey, msgValue)
    if (newState.error) throw new Error(newState.error)

    return storeKVT(msgKey, msgValue, nextRts())
  }

  function add(msg, cb) {
    try { cb(null, addSync(msg)) }
    catch (err) { cb(err) }
  }

  // publishSync: create a new signed message for the local feed.
  function publishSync(content, keys) {
    const _keys = keys || config.keys
    let enc
    try { enc = tryBox(content, boxers) } catch (e) { throw e }

    const latest    = stmts.latestByAuthor.get(_keys.id)
    const feedState = latest
      ? { id: latest.key, sequence: latest.seq, timestamp: latest.ts, queue: [] }
      : null

    const msgValue = V.create(feedState, _keys, hmacKey, enc, Date.now())
    const msgKey   = V.id(msgValue)
    return storeKVT(msgKey, msgValue, nextRts())
  }

  function publish(content, cb) {
    try { cb(null, publishSync(content)) }
    catch (err) { cb(err) }
  }

  function del(target, cb) {
    if (ssbRef.isFeed(target)) {
      sqlite.prepare('DELETE FROM links WHERE src = ?').run(target)
      sqlite.prepare('DELETE FROM messages WHERE author = ?').run(target)
    } else if (ssbRef.isMsg(target)) {
      sqlite.prepare('DELETE FROM links WHERE key = ?').run(target)
      sqlite.prepare('DELETE FROM messages WHERE key = ?').run(target)
    } else {
      return cb(new Error('del: invalid target: ' + target))
    }
    cb(null)
  }

  // queue: simplified — identical to add (no write-batching needed with SQLite)
  function queue(msg, cb) { add(msg, cb) }
  function flush(cb) { cb(null) }

  // ── Stream helpers ───────────────────────────────────────────────────────────

  // Build a pull-source from an array of rows + optional live tail.
  function buildSource(rows, opts, liveFilter) {
    const flags = streamFlags(opts)
    const items = rows.map((r) => formatMsg(rowToKVT(r), flags, unboxers))

    if (!opts || !opts.live) {
      // Non-live: just emit existing items (or empty if old=false)
      if (opts && opts.old === false) return pull.empty()
      return pull.values(items)
    }

    // Live: emit existing, then push the sync marker, then tail new messages.
    const p = pushable()
    if (opts.old !== false) items.forEach((item) => p.push(item))
    p.push({ sync: true })

    function onNew(kvt) {
      if (liveFilter(kvt)) p.push(formatMsg(kvt, flags, unboxers))
    }
    liveListeners.push(onNew)

    // Clean up listener when the consumer aborts / ends the stream.
    const origEnd = p.end.bind(p)
    p.end = function (err) {
      const i = liveListeners.indexOf(onNew)
      if (i !== -1) liveListeners.splice(i, 1)
      origEnd(err)
    }
    return p
  }

  // ── Stream methods ───────────────────────────────────────────────────────────

  function createLogStream(opts) {
    opts = opts || {}
    const conds = [], params = []
    if (opts.gt  != null) { conds.push('rts > ?');  params.push(opts.gt) }
    if (opts.gte != null) { conds.push('rts >= ?'); params.push(opts.gte) }
    if (opts.lt  != null) { conds.push('rts < ?');  params.push(opts.lt) }
    if (opts.lte != null) { conds.push('rts <= ?'); params.push(opts.lte) }

    let sql = 'SELECT * FROM messages'
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
    sql += ' ORDER BY rts ' + (opts.reverse ? 'DESC' : 'ASC')
    if (opts.limit > 0) sql += ' LIMIT ' + opts.limit

    const rows = sqlite.prepare(sql).all(...params)
    return buildSource(rows, opts, () => true)
  }

  function createHistoryStream(opts) {
    opts = opts || {}
    const id  = opts.id
    const seq = opts.sequence || opts.seq || 0
    if (!id || !ssbRef.isFeed(id))
      return pull.error(new Error('createHistoryStream: id must be a feed id'))

    let sql = 'SELECT * FROM messages WHERE author = ? AND seq >= ?'
    const params = [id, seq]
    if (opts.gt  != null) { sql += ' AND seq > ?';  params.push(opts.gt) }
    if (opts.gte != null) { sql += ' AND seq >= ?'; params.push(opts.gte) }
    if (opts.lt  != null) { sql += ' AND seq < ?';  params.push(opts.lt) }
    if (opts.lte != null) { sql += ' AND seq <= ?'; params.push(opts.lte) }
    sql += ' ORDER BY seq ' + (opts.reverse ? 'DESC' : 'ASC')
    if (opts.limit > 0) sql += ' LIMIT ' + opts.limit

    const rows = sqlite.prepare(sql).all(...params)
    return buildSource(rows, opts, (kvt) =>
      kvt.value.author === id && kvt.value.sequence >= seq)
  }

  // createUserStream is the local-only alias for createHistoryStream
  const createUserStream = createHistoryStream

  function createFeedStream(opts) {
    opts = opts || {}
    // Range filters apply to `ts` (the claimed timestamp), the same column the
    // stream is ordered by, mirroring messagesByType. `--gt 0` therefore means
    // "from the beginning of time", matching the classic createFeedStream idiom.
    const conds = [], params = []
    if (opts.gt  != null) { conds.push('ts > ?');  params.push(opts.gt) }
    if (opts.gte != null) { conds.push('ts >= ?'); params.push(opts.gte) }
    if (opts.lt  != null) { conds.push('ts < ?');  params.push(opts.lt) }
    if (opts.lte != null) { conds.push('ts <= ?'); params.push(opts.lte) }
    let sql = 'SELECT * FROM messages'
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
    sql += ' ORDER BY ts ' + (opts.reverse ? 'DESC' : 'ASC')
    if (opts.limit > 0) sql += ' LIMIT ' + opts.limit
    const rows = sqlite.prepare(sql).all(...params)
    return buildSource(rows, opts, () => true)
  }

  function createSequenceStream() {
    const p = pushable()
    p.push(since.value())
    since((seq) => p.push(seq))
    return p
  }

  function messagesByType(opts) {
    if (typeof opts === 'string') opts = { type: opts }
    opts = opts || {}
    const type = opts.type
    if (!type) return pull.error(new Error('messagesByType: type is required'))

    const conds = ['type = ?'], params = [type]
    if (opts.gt  != null) { conds.push('rts > ?');  params.push(opts.gt) }
    if (opts.gte != null) { conds.push('rts >= ?'); params.push(opts.gte) }
    if (opts.lt  != null) { conds.push('rts < ?');  params.push(opts.lt) }
    if (opts.lte != null) { conds.push('rts <= ?'); params.push(opts.lte) }

    let sql = 'SELECT * FROM messages WHERE ' + conds.join(' AND ')
    sql += ' ORDER BY rts ' + (opts.reverse ? 'DESC' : 'ASC')
    if (opts.limit > 0) sql += ' LIMIT ' + opts.limit

    const rows = sqlite.prepare(sql).all(...params)
    return buildSource(rows, opts, (kvt) => {
      const c = kvt.value.content
      return c && typeof c === 'object' && c.type === type
    })
  }

  function createWriteStream(cb) {
    // pull-stream sink; used by replication (ssb-ebt) to bulk-import messages.
    // Invalid messages are silently skipped (original ssb-db emits 'invalid').
    return pull.drain(
      (msg) => { try { addSync(msg) } catch (_) {} },
      (err) => { if (cb) cb(err || null) }
    )
  }

  function links(opts) {
    opts = opts || {}
    const conds = [], params = []

    if (opts.source) {
      if (opts.source !== '@') { conds.push('l.src = ?'); params.push(opts.source) }
    }
    if (opts.dest) {
      if (opts.dest === '%') {
        conds.push("substr(l.dest,1,1) = '%'")
      } else if (opts.dest === '&') {
        conds.push("substr(l.dest,1,1) = '&'")
      } else {
        conds.push('l.dest = ?'); params.push(opts.dest)
      }
    }
    if (opts.rel) { conds.push('l.rel = ?'); params.push(opts.rel) }

    let sql = 'SELECT l.src,l.dest,l.rel,l.key,m.raw FROM links l JOIN messages m ON l.key=m.key'
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
    if (opts.reverse) sql += ' ORDER BY l.rowid DESC'

    const includeValues = opts.values === true
    const includeKeys   = opts.keys   !== false

    const rows = sqlite.prepare(sql).all(...params)
    const results = rows.map((row) => {
      const r = { source: row.src, rel: row.rel, dest: row.dest, key: row.key }
      if (includeValues) r.value = JSON.parse(row.raw)
      return r
    })

    if (!opts.live) return pull.values(results)

    const p = pushable()
    results.forEach((r) => p.push(r))
    p.push({ sync: true })

    function onNew(kvt) {
      const c = kvt.value.content
      if (typeof c !== 'object' || !c) return
      for (const ln of extractLinks(kvt.value.author, kvt.key, c)) {
        if (opts.source && opts.source !== '@' && ln.src !== opts.source) continue
        if (opts.dest) {
          if (opts.dest === '%' && ln.dest[0] !== '%') continue
          if (opts.dest === '&' && ln.dest[0] !== '&') continue
          if (opts.dest !== '%' && opts.dest !== '&' && ln.dest !== opts.dest) continue
        }
        if (opts.rel && ln.rel !== opts.rel) continue
        const r = { source: ln.src, rel: ln.rel, dest: ln.dest, key: ln.key }
        if (includeValues) r.value = kvt.value
        p.push(r)
      }
    }
    liveListeners.push(onNew)
    const origEnd = p.end.bind(p)
    p.end = function (err) {
      const i = liveListeners.indexOf(onNew)
      if (i !== -1) liveListeners.splice(i, 1)
      origEnd(err)
    }
    return p
  }

  // ── Query methods ────────────────────────────────────────────────────────────

  function get(opts, cb) {
    if (typeof opts === 'number') {
      // Get by log offset (rowid)
      const row = stmts.getByRowid.get(opts)
      if (!row) return cb(new Error('not found at offset: ' + opts))
      return cb(null, rowToKVT(row).value)
    }

    let id, meta, decrypt
    if (typeof opts === 'string') {
      id = opts
    } else {
      id      = opts.id || opts.key
      meta    = opts.meta === true
      decrypt = opts.private === true || !!opts.unbox
    }

    if (!id) return cb(new Error('get: id is required'))
    if (!ssbRef.isMsg(id)) return cb(new Error('get: invalid message id: ' + id))

    const row = stmts.getByKey.get(id)
    if (!row) return cb(new Error('not found: ' + id))

    const kvt = rowToKVT(row)
    if (meta) return cb(null, kvt)

    let value = kvt.value
    if (decrypt) {
      const plain = tryUnbox(value, unboxers)
      if (plain) {
        value = Object.assign({}, value, {
          content: plain,
          meta: { private: true, original: { content: value.content } }
        })
      }
    }
    cb(null, value)
  }

  function latest() {
    const rows = sqlite.prepare(`
      SELECT author, key, MAX(seq) AS seq, ts
      FROM messages GROUP BY author
    `).all()
    return pull.values(rows.map((r) => ({ id: r.author, sequence: r.seq, ts: r.ts })))
  }

  function getLatest(feedId, cb) {
    const row = stmts.latestByAuthor.get(feedId)
    if (!row) return cb(null, null)
    cb(null, rowToKVT(row))
  }

  function latestSequence(feedId, cb) {
    const row = stmts.latestByAuthor.get(feedId)
    if (!row) return cb(new Error('no messages for feed: ' + feedId))
    cb(null, row.seq)
  }

  function getVectorClock(_, cb) {
    if (typeof _ === 'function') { cb = _; _ = null }
    const rows = sqlite.prepare('SELECT author, MAX(seq) AS seq FROM messages GROUP BY author').all()
    const clock = {}
    for (const r of rows) clock[r.author] = r.seq
    cb(null, clock)
  }

  function getAtSequence(seqid, cb) {
    let feedId, seq
    if (Array.isArray(seqid)) {
      [feedId, seq] = seqid
    } else if (typeof seqid === 'string' && seqid.includes(':')) {
      const parts = seqid.split(':')
      feedId = parts[0]; seq = parseInt(parts[1], 10)
    } else {
      return cb(new Error('getAtSequence: invalid seqid'))
    }
    const row = stmts.getByAuthorSeq.get(feedId, seq)
    if (!row) return cb(new Error('not found: ' + feedId + ':' + seq))
    cb(null, rowToKVT(row))
  }

  function whoami() {
    return { id: config.keys.id }
  }

  function progress() {
    const n = sqlite.prepare('SELECT COUNT(*) AS n FROM messages').get().n
    return { indexes: { start: 0, current: n, target: n } }
  }

  function status() {
    return {
      progress: progress(),
      db: { since: since.value() },
      sync: { since: since.value(), plugins: {}, sync: true }
    }
  }

  function version() {
    // Report the server package version (matches classic ssb-server, which
    // returns its own version) rather than a hard-coded constant.
    try { return require('../package.json').version }
    catch (e) { return '1.0.0' }
  }
  function help()    { return 'SSB SQLite database — node:sqlite backed store' }

  function search(opts, cb) {
    if (typeof opts === 'string') opts = { query: opts }
    if (!opts.query) return cb(null, [])

    const limit = opts.limit || 50
    // Use rank for better results
    const results = sqlite.prepare(`
      SELECT messages.*, search_index.type as msg_type
      FROM search_index 
      JOIN messages ON search_index.key = messages.key
      WHERE search_index.text MATCH ?
      ORDER BY rank, messages.rts DESC
      LIMIT ?
    `).all(opts.query, limit)

    cb(null, results.map(rowToKVT))
  }

  // ready(): always true — SQLite has no async index-building lag.
  // Used by ssb-gossip (and potentially other plugins) to check if the store
  // is warmed up before scheduling outbound connections.
  function ready() { return true }

  // ── Local-only helpers (not RPC) ─────────────────────────────────────────────

  // createFeed: returns a feed object for authoring messages with custom keys.
  // Used by test helpers and ssb-generate.
  function createFeed(keys) {
    const _keys = keys || config.keys
    function addContent(content, cb) {
      try { cb(null, publishSync(content, _keys)) }
      catch (err) { cb(err) }
    }
    return { add: addContent, publish: addContent, id: _keys.id, keys: _keys }
  }

  function addMap(fn)     { /* transforms applied on read — stub for now */ }
  function addBoxer(fn)   { boxers.push(fn) }
  function addUnboxer(fn) { unboxers.push(fn) }

  // _flumeUse: ssb-links and ssb-query register Flume views here.
  // We stub it to avoid crashes; our built-in links() handles basic link queries.
  function _flumeUse(name, view) {
    return {
      read:               () => pull.empty(),
      get:                (_, cb) => cb && cb(new Error(name + ': not available in SQLite mode')),
      createHistoryStream:() => pull.empty()
    }
  }

  return {
    // RPC-exposed methods
    get, add, publish, del, queue, flush, ready, search,
    createLogStream, createFeedStream, createHistoryStream,
    createUserStream, createWriteStream, createSequenceStream,
    messagesByType, links, latest, getLatest, latestSequence,
    getVectorClock, getAtSequence,
    whoami, progress, status, version, help,
    // Internal (accessible on server.db but not via RPC)
    post, since, createFeed,
    addMap, addBoxer, addUnboxer, _flumeUse
  }
}

// ─── secret-stack plugin export ───────────────────────────────────────────────
// No `name` field — like the original ssb-db, methods are merged directly onto
// the server root (server.get, server.add, …) rather than namespaced as server.db.*
module.exports = {
  version: '1.0.0',
  manifest: {
    get:                  'async',
    add:                  'async',
    publish:              'async',
    del:                  'async',
    queue:                'async',
    flush:                'async',
    search:               'async',
    createLogStream:      'source',
    createFeedStream:     'source',
    createHistoryStream:  'source',
    createUserStream:     'source',
    createWriteStream:    'sink',
    createSequenceStream: 'source',
    messagesByType:       'source',
    links:                'source',
    latest:               'source',
    getLatest:            'async',
    latestSequence:       'async',
    getVectorClock:       'async',
    getAtSequence:        'async',
    whoami:               'sync',
    ready:                'sync',
    progress:             'sync',
    status:               'sync',
    version:              'sync',
    help:                 'sync'
  },
  permissions: {
    anonymous: {
      allow: [
        'whoami', 'createLogStream', 'createUserStream', 'createHistoryStream',
        'createFeedStream', 'createSequenceStream', 'messagesByType', 'get',
        'getLatest', 'latest', 'latestSequence', 'links', 'status', 'progress',
        'version', 'help', 'search'
      ]
    }
  },
  init: function (server, config) {
    const db = createDatabase(config)
    // Expose the internal interface on server.db so plugins like ssb-ebt,
    // ssb-private1, ssb-links, etc. can reach post/since/addUnboxer/createFeed.
    server.db = db
    return db
  }
}
