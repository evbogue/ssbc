# 2026-02-13 — Lite client contract test (Option B)

## Plan
- Add a new tape test under `test/` that boots an ephemeral sbot instance (similar to `test/bin.js`).
- Use `ssb-client` to connect and verify minimal RPC contract:
  - `whoami` returns an id.
  - (optional) `query.read` or `links2.read` is callable (if exposed).
- Use the sbot HTTP server to verify blobs HTTP contract:
  - `POST /blobs/add` accepts bytes and returns a blob hash.
  - `GET /blobs/get/<hash>` returns the same bytes.
- Keep ports and any temp dirs ephemeral; ensure sbot is closed at end.
- Run `fnm use 22`, then `npm test` and `npm run build:web`.
- Commit with a clear message.

## Work log
- Creating new tape test `test/lite-contract.js` to cover lite-client contract (RPC + HTTP blob endpoints) using ephemeral ports.
- Implemented `test/lite-contract.js`:
  - Picks free ports (sbot + ws) via `net.createServer().listen(0)`.
  - Boots `bin.js start` with tmp path + random caps.
  - Uses `bin.js address device` to discover ws multiserver address, then connects with `ssb-client`.
  - Asserts `whoami` works.
  - Optionally calls `query.read` or `links2.read` (if present) and consumes up to 1 item.
  - Uses raw HTTP to `POST /blobs/add` and `GET /blobs/get/:hash` on the ws port to round-trip bytes.
- Fix: `bin.js address device` needed explicit `--port`/`--ws.port` args; otherwise it tried default 8008 and the test failed.
- Verified under Node 22 (`fnm use 22`):
  - `npm test` passes.
  - `npm run build:web` passes.
