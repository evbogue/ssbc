# SQLite DB / Replication Compatibility — Work Order

Context: Dominic suggested reverting ssbc/ssb-server commit
[`1fff829` ("rm compatability")](https://github.com/ssbc/ssb-server/commit/1fff82937bac4da80e8fd0ed573f35f1fd1c153f),
which removed the `compatibility` version-matrix test and the `ssb-db` pin from
ssb-server's `package.json`. His concern: that test "made sure ssb was
compatible."

That specific revert is a **no-op for us** — we no longer depend on `ssb-db`.
`lib/db.js` is a `node:sqlite`-backed store that replaced the entire flume stack
(`ssb-db` + `flumedb` + `flumelog-offset` + `flumeview-*` + `jitdb` + `level` +
`leveldown`) and claims to be "wire-compatible with ssb-db so all existing
plugins work unchanged." Compatibility is enforced structurally because
`lib/db.js` still validates every message through the canonical `ssb-validate`
+ `ssb-keys` + `ssb-ref`.

The *spirit* of his concern still applied, though: we had **no test that two
peers on the SQLite db actually replicate.** That gap is now closed (see Done),
but a few follow-ups came out of the work.

---

## Done

- **Added `test/replication.js`** — the first real replication test in the repo.
  Builds two live `secret-stack` peers (`lib/db` + `ssb-replicate-stub` +
  `ssb-ebt`), connects them, and asserts feeds replicate. Covers both
  historical catch-up (publish then connect) and realtime (connect then
  publish, exercising EBT's live `sbot.post` path). 19/19 assertions pass; runs
  inside `npm test`. **Result: EBT replicates correctly against the SQLite
  store.**

---

## Follow-ups to look at later

### 1. `createHistoryStream` has no `live` mode  — latent client-side gap
`lib/db.js:460` snapshots `rowid <= maxRowid` at call time and has no live
branch. EBT replication does **not** depend on this (it uses `getVectorClock` /
`getAtSequence` / `sbot.post`), so replication is unaffected. **But** any
client/UI code that calls `createHistoryStream({ live: true })` expecting a
tailing stream will silently get only the historical snapshot and never see new
messages.
- Action: audit callers (Decent UI, plugins) for `createHistoryStream({ live:
  true })` and `createUserStream` with `live`. Either implement a live branch
  (the `since` observable used by `createFeedStream`/`createSequenceStream`
  already provides the hook) or confirm no caller relies on it.

### 2. `ebt.request` is not exposed — confirm nothing external calls it
The `ssb-ebt` manifest lists `request: 'sync'`, but secret-stack only exposes
`ebt.replicate` / `ebt.peerStatus` / `ebt.block`. The working trigger is
`replicate.request(id, true)` (which ssb-ebt hooks). The replication test uses
that.
- Action: grep plugins/clients for `.ebt.request(` calls — any would be silently
  no-op'ing. (Quick check; likely clean.)

### 3. Fixture-replay test against a real ssb-db feed (belt-and-suspenders)
The replication test proves peer-to-peer sync works between two *SQLite* peers.
It does not prove we interop with a feed produced by *real ssb-db*. A small
fixture test — take a known-good ssb-db-produced feed (drop it in `test/data`),
ingest it through `lib/db.js`, and assert byte-identical re-emit + validation —
would close interop with the existing network, not just with ourselves.
- Lower priority: `ssb-validate` already guarantees the message format, so this
  is confirmation rather than new coverage.

### 4. Reply to Dominic
Explain that the revert is a no-op for us (we dropped ssb-db for a SQLite store
that validates through `ssb-validate`), and that the replication tests he asked
for now pass against the SQLite version. Draft already prepared in chat.
