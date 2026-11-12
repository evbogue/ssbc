'use strict'

const ref = require('ssb-ref')
const validate = require('ssb-validate')

// A staged suffix is readable, but only the canonical table drives EBT and
// indexes. Promotion uses the normal write path once the two ranges join.
module.exports = function createRecentStore(db, hmacKey, add, transaction) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recent_messages (
      author TEXT NOT NULL,
      seq INTEGER NOT NULL,
      key TEXT NOT NULL,
      rts REAL NOT NULL,
      raw TEXT NOT NULL,
      PRIMARY KEY (author, seq)
    ) WITHOUT ROWID;
  `)
  const insert = db.prepare('INSERT INTO recent_messages VALUES (?, ?, ?, ?, ?)')
  const head = db.prepare('SELECT seq, key FROM messages WHERE author = ? ORDER BY seq DESC LIMIT 1')
  const oldest = db.prepare('SELECT * FROM recent_messages WHERE author = ? ORDER BY seq LIMIT 1')
  const newest = db.prepare('SELECT seq FROM recent_messages WHERE author = ? ORDER BY seq DESC LIMIT 1')
  const at = db.prepare('SELECT key FROM messages WHERE author = ? AND seq = ?')
  const remove = db.prepare('DELETE FROM recent_messages WHERE author = ? AND seq <= ?')
  const reset = db.prepare('DELETE FROM recent_messages WHERE author = ?')
  const byKey = db.prepare('SELECT author FROM recent_messages WHERE key = ?')
  const promote = db.prepare('SELECT raw, seq FROM recent_messages WHERE author = ? ORDER BY seq LIMIT ?')
  const overlap = db.prepare(`
    SELECT r.seq FROM recent_messages r LEFT JOIN messages m ON r.author = m.author AND r.seq = m.seq
    WHERE r.author = ? AND r.seq <= ? AND (m.key IS NULL OR r.key != m.key) LIMIT 1
  `)
  const read = db.prepare(`
    SELECT key, raw, rts FROM (
      SELECT key, raw, rts, seq FROM (
        SELECT key, raw, rts, seq FROM messages WHERE author = ? AND seq <= ? ORDER BY seq DESC LIMIT ?
      )
      UNION ALL
      SELECT key, raw, rts, seq FROM (
        SELECT key, raw, rts, seq FROM recent_messages
        WHERE author = ? AND seq > ? AND seq <= ? ORDER BY seq DESC LIMIT ?
      )
    ) ORDER BY seq DESC LIMIT ?
  `)

  function status(id) {
    const current = head.get(id)
    const first = oldest.get(id)
    const sequence = current ? current.seq : 0
    if (!first) return { sequence, newest: sequence, before: null, complete: true }
    if (current && (overlap.get(id, sequence) ||
        (first.seq === sequence + 1 && JSON.parse(first.raw).previous !== current.key))) {
      throw new Error('recentSync: staged history conflicts with local history')
    }
    return {
      sequence,
      newest: Math.max(newest.get(id).seq, sequence),
      before: first.seq > sequence + 1 ? first.seq : null,
      complete: false
    }
  }

  function commit(id, before, page, limit) {
    return transaction(() => {
      const initial = status(id)
      if (initial.before !== before) throw new Error('recentSync: local cursor changed, retry the page')
      const first = oldest.get(id)
      let expected = first && { sequence: first.seq - 1, key: JSON.parse(first.raw).previous }
      let received = 0
      for (const entry of page) {
        const value = entry && entry.value
        if (!value || value.author !== id || !Number.isSafeInteger(value.sequence) ||
            value.sequence < 1 || !Number.isFinite(value.timestamp) ||
            (value.sequence === 1 ? value.previous !== null : !ref.isMsg(value.previous))) {
          throw new Error('recentSync: invalid feed message')
        }
        const invalid = validate.checkInvalidOOO(value, hmacKey)
        if (invalid) throw invalid
        const key = validate.id(value)
        if (entry.key !== key || (expected && (value.sequence !== expected.sequence || key !== expected.key))) {
          throw new Error('recentSync: unexpected message hash or sequence')
        }
        if (value.sequence <= initial.sequence) {
          const local = at.get(id, value.sequence)
          if (!local || local.key !== key) throw new Error('recentSync: peer history conflicts with local history')
          break
        }
        insert.run(id, value.sequence, key, Date.now(), JSON.stringify(value))
        received++
        expected = { sequence: value.sequence - 1, key: value.previous }
      }
      if (before !== null && !page.length) throw new Error('recentSync: peer is missing the requested history')

      let promoted = 0
      const staged = status(id)
      if (staged.before === null && !staged.complete) {
        remove.run(id, staged.sequence)
        for (const row of promote.all(id, limit)) {
          add(JSON.parse(row.raw))
          remove.run(id, row.seq)
          promoted++
        }
      }
      return { ...status(id), received, promoted }
    })
  }

  return {
    status, commit,
    read(id, max, limit) {
      const { sequence } = status(id)
      return read.all(id, max, limit, id, sequence, max, limit, limit).map(row => ({
        key: row.key, value: JSON.parse(row.raw), timestamp: row.rts
      }))
    },
    reset: id => reset.run(id).changes,
    removeKey(key) {
      // Dropping one staged entry would leave a discontinuous suffix.
      const row = byKey.get(key)
      if (row) reset.run(row.author)
    }
  }
}
