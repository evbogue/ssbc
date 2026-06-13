# Work Order: Codebase improvement pass

**Status:** Ready to implement
**Origin:** This is a Fable-generated work order — produced by Claude Fable 5 from a full-project review on 2026-06-12. Every finding below was verified against the code (and, where noted, by experiment) before being written down.
**Intent:** Fix the correctness bugs, close the public-instance security gaps, and clear the hygiene debt found in the review. No feature work. Each chunk below is a discrete, shippable change per the AGENTS.md rhythm: build, test, commit, push both remotes.

## Priorities at a glance

1. **Chunk 1 — anonymous `search()` crash** (bug, remotely triggerable)
2. **Chunk 2 — public-instance write exposure** (security: unauthenticated git push and blob upload)
3. **Chunk 3 — CI on GitHub Actions** (nothing runs the suite on push today)
4. **Chunk 4 — db.js write-path integrity** (transactions, FTS cleanup on `del`, hoisted statement)
5. **Chunk 5 — stream memory behavior** (`.all()` → `iterate()`, `links()` limit)
6. **Chunk 6 — `ssb-query` honesty** (mounted but silently returns empty)
7. **Chunk 7 — dependency and repo hygiene** (unused devDeps, dead `.travis.yml`, stray files, small nits)
8. **Chunk 8 (optional) — native crypto opt-in** (performance)

Chunks 1–3 are the ones to do first. 4–7 are independent of each other and can land in any order. 8 needs a decision from Ev before starting.

---

## Chunk 1 — `search()` can be crashed by any anonymous peer

**Where:** `lib/db.js` — `search()` (~line 652), permissions list (~line 750).

`search()` passes the caller's query string straight into an FTS5 `MATCH`:

```js
).all(opts.query, limit)
```

FTS5 throws synchronously on malformed query syntax — verified: a lone `"` raises `unterminated string` from `.all()`. There is no try/catch, and `search` is in the **anonymous** permission allowlist, so any connected peer or any browser client can drive an uncaught throw into the RPC layer.

**Fix:**

- Wrap the prepare/all in try/catch; on error, `cb(err)` with a clean message (do not leak the SQLite error verbatim if it includes the query).
- Decide the semantics: either surface FTS syntax errors to the caller as an error, or sanitize the input into a safe quoted-phrase query (escape embedded `"` and wrap each term). Sanitizing is friendlier for UI search boxes; erroring is simpler. Either is acceptable — pick one and document it in `docs/api.md` under `search`.

**Test:** add cases to the db test coverage: a malformed query (`"`, `(`, `NEAR(`) must not throw and must call back; a normal query still returns hits; an empty query returns `[]` (existing behavior).

**Done when** a malformed search query from an anonymous RPC client gets an error (or empty result) callback and the server keeps running.

## Chunk 2 — unauthenticated writes reachable on public instances

**Where:** `plugins/git-server.js` (`handleReceivePack`), `lib/ui-server.js` (`handleBlobAdd`, request routing in `handleRequest`).

Two HTTP endpoints mutate the node with no authentication:

- `POST /git/:repoId/git-receive-pack` — accepts a push from anyone who can reach the port and **publishes `git-update` messages signed by the node's own key**. On `127.0.0.1` this is the intended dogfooding workflow. Behind the reverse proxies that serve decent.evbogue.com and ssbski.evbogue.com, it means anyone on the internet may be able to push commits into hosted repos *as the node identity*, unless the proxy blocks it.
- `POST /blobs/add` — unauthenticated blob upload (disk-fill vector), and it sets `Access-Control-Allow-Origin: *`, so even a drive-by webpage can upload blobs through a visitor's local node.

**Fix:**

- Add a config gate, e.g. `decent.writes: 'local' | 'open' | 'off'` (default `'local'`).
  - `'local'`: mutating endpoints (`git-receive-pack`, the receive-pack `info/refs` advertisement, `/blobs/add`) are only honored when the request arrives from a loopback peer **and** is not forwarded (`requestIsForwarded(req)` already exists in `ui-server.js` — reuse it). Forwarded or non-loopback requests get `403`.
  - `'open'`: today's behavior, for deployments that intentionally accept pushes.
  - `'off'`: read-only node; all mutating endpoints 403.
- For the receive-pack advertisement specifically: when writes are denied, omit `git-receive-pack` from `info/refs` (return 403 on `?service=git-receive-pack`) so `git push` fails with a clear message instead of failing mid-pack.
- Drop `Access-Control-Allow-Origin: *` from `/blobs/add` (keep it on `/blobs/get` — public reads are fine).
- Document the new config key in `docs/api.md` / `docs/overview.md` wherever `decent.*` config is described, and call it out in the README section about public instances.

**Test:** extend `test/git-server-protocol.js` (or a new `test/git-server-auth.js`): with `writes: 'local'`, a push with `X-Forwarded-Host` set is refused with 403 and publishes nothing; without forwarding headers from loopback it succeeds; with `writes: 'off'` both fail; `/blobs/add` follows the same matrix.

**Done when** a default-configured node refuses forwarded/non-loopback pushes and blob uploads, decent.evbogue.com can be redeployed with no proxy-level blocklist required, and the existing local `git push ssb` workflow still works.

## Chunk 3 — real CI

**Where:** new `.github/workflows/test.yml`; delete `.travis.yml`.

`.travis.yml` targets Node 8/10/12 on a service that no longer runs builds, while `package.json` requires Node ≥ 22.5. Nothing runs the suite on push.

**Fix:**

- Add a GitHub Actions workflow: on `push` to `main` and on `pull_request`, run `npm ci` (or `npm install` — the repo ships `npm-shrinkwrap.json`) and `npm test` on Node 22 (and optionally current). The suite takes ~45 s locally; no special services needed beyond `git` being on PATH (it is, on the runners).
- The workflow must **not** run `npm run build:web` unless a test needs it — check `test/docs.js` and friends for build-dir assumptions; if any test requires the built bundle, add the build step before the test step.
- Delete `.travis.yml`.

**Done when** the badge-less minimum is true: a push to GitHub runs `npm test` and fails the commit status when the suite fails.

## Chunk 4 — db.js write-path integrity

**Where:** `lib/db.js` — `storeKVT()`, `del()`, `createWriteStream()`, `stmts`.

Three related fixes, one chunk:

1. **Transaction around a message write.** `storeKVT` performs the message insert, N link inserts, and a search-index insert as separate implicit transactions. Wrap the whole of `storeKVT`'s SQL in `BEGIN`/`COMMIT` (node:sqlite has no transaction helper — use `sqlite.exec('BEGIN')` / `COMMIT` / `ROLLBACK` in try/catch, or prepare those once). A crash mid-write must not leave a message without its links/search rows.
2. **Batch replication writes.** `createWriteStream` calls `addSync` per message, paying a WAL commit each. Accumulate and wrap batches (e.g. per drain callback or a simple N-message/`flush` batch) in one transaction. This is the hot path for initial sync; the win is large and the change is local to `createWriteStream`.
3. **`del()` must clean `search_index`.** It currently deletes from `links` and `messages` only; FTS rows for deleted content stay on disk forever. Add the matching `DELETE FROM search_index WHERE key = ?` (by-message) and `... WHERE key IN (SELECT key FROM messages WHERE author = ?)` (by-feed, executed **before** the messages delete).
4. **Hoist the search-index INSERT.** `storeKVT` re-prepares `INSERT INTO search_index ...` on every message. Move it into the `stmts` object with the other hot-path statements.

**Test:** `del()` of a feed/message removes its search hits (`search()` no longer returns them and `search_index` has no rows for the deleted keys). Bulk-add via `createWriteStream` of a few hundred messages still produces the same row counts. Existing suite stays green.

**Done when** a message write is atomic, replication writes are batched, `del` leaves no FTS residue, and no statement is prepared inside the per-message path.

## Chunk 5 — stream memory behavior

**Where:** `lib/db.js` — `createLogStream`, `createHistoryStream`, `createFeedStream`, `messagesByType`, `links`, `buildSource`.

Every stream method materializes its full result set with `.all()` and JSON-parses every row before the first item is emitted. `createLogStream({})` on a large store loads the entire database into memory. `links()` additionally supports no `limit` option at all and is anonymous-callable — a cheap memory DoS on a public node.

**Fix:**

- Add a pull-source wrapper around `StatementSync.iterate()` and route the non-live portion of each stream through it, so rows are read and parsed lazily as the consumer pulls. The live-tail logic in `buildSource` stays as is — only the "existing rows" phase changes. Mind one node:sqlite caveat: an open iterator must not interleave with writes on the same connection — either fully drain the iterator per pull-stream batch or document/verify the behavior with a test that writes while a slow consumer reads.
- Add `limit` support to `links()` (SQL `LIMIT`, same pattern as the other methods).

**Test:** a `createLogStream` consumer that takes only 5 items from a large table causes only ~5 row materializations (observable via a wrapped `rowToKVT` counter in the test, or at minimum: the stream still returns correct data and the live/sync marker behavior is unchanged). `links({limit: 10})` returns 10.

**Done when** non-live streams are lazy end-to-end and `links` honors `limit`. (If the iterate/write interleaving caveat proves nasty, the fallback is chunked `LIMIT/OFFSET` paging — lazy enough, boring, and safe.)

## Chunk 6 — `ssb-query` is mounted but silently broken

**Where:** `lib/db.js` `_flumeUse` stub (~line 694), `lib/builtin-plugins.js` (~line 46), `docs/api-reference.md` generation.

`ssb-query` registers its flume view through the `_flumeUse` stub, which returns `read: () => pull.empty()`. Result: `query.read` always yields an empty stream — no error, just nothing. It is listed as `kind: 'rpc'` in the registry, so the generated API reference advertises a method that cannot work. This has already cost debugging time (clients must use `messagesByType`/`links` instead).

**Fix — pick one, decision belongs to Ev but the default recommendation is (a):**

- **(a) Demote and be honest.** Change the registry entry to `kind: 'stub'`, make the stub's `read` return `pull.error(new Error('query.read is not supported in SQLite mode — use messagesByType or links'))` instead of silently empty, and note the limitation in `docs/api.md`. Cheap, kills the silent-failure trap immediately.
- **(b) Implement a subset.** Translate the common map-filter-reduce query shapes (`$filter` on `value.content.type`, `value.author`, timestamp sort) into SQL. Substantially more work; only worth it if some client actually needs `query.read` semantics.

**Done when** calling `query.read` either works or fails loudly with a pointer to the supported alternative — it never again returns a silent empty stream — and the API reference reflects reality.

## Chunk 7 — dependency and repo hygiene

Small, mechanical, one commit (or a few):

- **Unused devDependencies** (verified: required nowhere in first-party code): `cat-names`, `dog-names`, `hexpp`, `interleavings`, `npm-install-package`, `rng`, `typewiselite`, `ssb-feed`, `ssb-generate`, `pull-bitflipper`. Remove them, then run the full suite — some may be load-bearing for vendored test helpers despite the grep; re-add any that prove needed, with a comment in package.json is not possible so note it in `docs/docs-maintenance.md` if surprising.
- **Unused runtime dependency:** `pull-many`. Same drill.
- **Stray tracked screenshots:** `active-people.png` and `active-people-2.png` at the repo root are dev screenshots; delete them (or move under `docs/img/` if any doc wants them — none references them today).
- **Duplicate `svg` key** in the MIME map in `plugins/git-server.js` (~lines 567–570) — delete the second one.
- **`emitWarning` patch in `lib/db.js`** (lines 13–21): the patch permanently swallows every process warning matching `/sqlite/i`, and line 21 (`process.emitWarning = process.emitWarning`) is a no-op self-assignment with a comment claiming it restores something. Either scope the suppression to the one `ExperimentalWarning` name + sqlite match, or at minimum delete the no-op line and fix the comment. Check whether Node ≥ 22.13 still emits the warning at all — if not, delete the whole block.
- **`npm run reinstall` / shrinkwrap note:** while touching package.json, regenerate `npm-shrinkwrap.json` via the existing `reinstall` script so the lockfile matches.

**Done when** `npm install && npm test` is green with the trimmed dependency set and the working tree has no stray screenshots.

## Chunk 8 (optional, needs Ev's sign-off) — native crypto opt-in

**Where:** `bin.js:4` (`process.env.CHLORIDE_JS = process.env.CHLORIDE_JS || '1'`), `.npmrc` (`optional=false`).

The zero-native-deps install is a core project thesis ("no more build failures on modern Node") and must stay the default. But forcing `CHLORIDE_JS=1` means every signature verification — the hot loop of replication — runs in pure JS, roughly an order of magnitude slower than libsodium. The suite already demonstrates the fallback path works ("falling back to javascript version").

**Proposed shape (do not start without sign-off):**

- Keep JS as the guaranteed default. Change `bin.js` to only force `CHLORIDE_JS=1` when `sodium-native` is not resolvable; if a pub operator has deliberately run `npm install sodium-native`, let chloride use it.
- Document the opt-in in the README's pub-operator section: one command, faster replication, entirely optional.
- Decide whether `.npmrc optional=false` stays (it should — it is what keeps the default install native-free).

**Done when** default installs are byte-for-byte as dependency-free as today, and a node with `sodium-native` manually installed uses it.

---

## Explicitly out of scope

- Frontend file splits (`decent/src/modules/ui/like.js`'s embedded emoji dataset, `git-browser.js`'s size). AGENTS.md treats file style as load-bearing; structural refactors there need their own conversation.
- Any change to replication semantics, the blocking model (see `docs/blocking-model.md`), or message validation.
- New features of any kind.

## Done when (whole work order)

- Chunks 1–7 are landed as individual commits on `main`, pushed to both `origin` and `ssb`, each leaving `npm test` green.
- Chunk 8 has an explicit go/no-go decision from Ev recorded in this file (edit the Status line or strike the section).
- This file's **Status** line is updated to `Complete` and the file is either kept as a record or removed in the final commit, per Ev's preference for finished work orders (precedent: commit `0df8df1` removed finished work orders).
