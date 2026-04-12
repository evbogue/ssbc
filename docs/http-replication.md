# Work Order: HTTP Replication Layer

## Background

SSB's current replication stack (Secret Handshake → multiserver → muxrpc → EBT) is
efficient but requires persistent TCP connections and Node.js-specific native modules.
This makes it difficult to deploy on modern platforms and impossible to implement in
runtimes like Deno without significant porting work.

The insight that motivates this work order: **SSB messages are self-authenticating**.
Every message carries an Ed25519 signature verifiable against the author's public key,
regardless of how the message was transported. This means transport security (provided
by HTTPS) and peer authentication (provided by signed requests) are sufficient — the
Secret Handshake is not required for data integrity.

This work order describes adding an HTTP replication transport alongside the existing
muxrpc stack in the Node.js sbot, and separately building a clean Deno implementation
that speaks only HTTP replication. Both implementations share the same SSB message
format and interoperate transparently.

---

## Goals

- Define a simple HTTP replication API that any SSB implementation can speak
- Add it to the Node.js sbot as an additional transport (muxrpc stays untouched)
- Build a fresh Deno/Supabase implementation against the same spec
- Preserve all SSB properties: offline-first, wide replication, pub model, direct
  peer sync — the transport changes, nothing else does

---

## HTTP Replication API Spec

All requests are authenticated with a signed Authorization header:

```
Authorization: SSB keyId="@pubkey.ed25519",ts=1712345678,nonce="hex",sig="base64"
```

`sig` covers `METHOD + " " + path + " " + ts + " " + nonce`, signed with the
requester's Ed25519 private key. Server rejects timestamps older than 5 minutes.

### Endpoints

```
GET  /ssb/v1/clock
```
Returns the server's current knowledge: `{ "@feedId": latestSeq, ... }`.
Used by peers to diff against their own clock and determine what to fetch.

```
GET  /ssb/v1/feed/:feedId?after=N&limit=100
```
Returns an array of SSB messages for the given feed with sequence > N.
Recipient verifies each message signature independently.

```
POST /ssb/v1/messages
Body: [ ...ssb messages ]
```
Push messages to a peer. Peer verifies signatures and rejects invalid messages.

```
GET  /ssb/v1/blobs/:blobId
```
Fetch a blob by its `&hash.sha256` ID.

```
POST /ssb/v1/blobs
Body: raw blob bytes
```
Push a blob. Server verifies the SHA-256 hash matches the blob ID.

```
GET  /ssb/v1/live
Content-Type: text/event-stream
```
Server-Sent Events stream. Server pushes `{ key, value }` events as new messages
arrive. Replaces muxrpc's live source streams for clients that want push updates.

### FOAF Access Control (optional, per-node policy)

Servers may restrict endpoints to peers within a configurable social graph radius
(default: 2 hops). The server checks whether the request's `keyId` is reachable
from the server's own feed ID within N hops of the follow graph.

This is a node operator policy decision, not a protocol requirement. A pub server
would likely set radius to 3 or disable it entirely. A personal node might set 1.

Replication breadth and offline-first behavior are unaffected by this — it only
controls who can pull from your node directly. Messages still spread through the
network normally via peers that have them.

---

## Phase 1: Add HTTP Transport to Node.js Sbot

**Files to create:**
- `plugins/http-replication/index.js` — the plugin, registers with secret-stack
- `plugins/http-replication/server.js` — Express/http route handlers
- `plugins/http-replication/client.js` — outbound replication (fetch peer clock,
  diff, pull missing messages)
- `plugins/http-replication/auth.js` — request signing (outbound) and verification
  (inbound)
- `plugins/http-replication/foaf.js` — FOAF radius check against the friends graph

**Files to modify:**
- `index.js` — `.use(require('./plugins/http-replication'))`
- `package.json` — add port config (`httpReplication.port`, default 8990)

**Behavior:**
- Runs on a separate port from ssb-ws (e.g., 8990)
- Does not replace muxrpc — both transports run simultaneously
- Peers advertise HTTP replication capability via a new multiserver address component
- Config opt-in: `httpReplication.enabled: true`

---

## Phase 2: Deno Implementation

A clean-room SSB node targeting Deno with zero Node.js dependencies.

**Storage:** Supabase Postgres (or any Postgres)

```sql
CREATE TABLE messages (
  seq       BIGSERIAL PRIMARY KEY,
  key       TEXT UNIQUE NOT NULL,    -- %hash.sha256
  author    TEXT NOT NULL,           -- @pubkey.ed25519
  sequence  INTEGER NOT NULL,
  ts        BIGINT,
  type      TEXT,
  content   JSONB,
  raw       JSONB NOT NULL
);
CREATE INDEX idx_author_seq ON messages (author, sequence);
CREATE INDEX idx_type       ON messages (type);

CREATE TABLE follows (
  source TEXT NOT NULL,
  dest   TEXT NOT NULL,
  PRIMARY KEY (source, dest)
);

CREATE TABLE blobs (
  id   TEXT PRIMARY KEY,   -- &hash.sha256
  data BYTEA NOT NULL
);
-- or: use Supabase Storage for blobs (S3-compatible)
```

**Crypto:** `crypto.subtle` (Web Crypto API, built into Deno)
- Ed25519 sign/verify: `crypto.subtle.sign/verify` with `"Ed25519"` algorithm
- SHA-256: `crypto.subtle.digest`
- No native modules, no npm packages for crypto

**Entry point:** `deno run --allow-net --allow-env main.ts`

**Key modules to write:**
- `src/keys.ts` — keypair generation, load/save from env or Supabase secret
- `src/messages.ts` — message validation, signature verification, hash computation
- `src/db.ts` — Postgres query wrappers (using `deno-postgres` or Supabase JS client)
- `src/server.ts` — `Deno.serve()` HTTP handler, all `/ssb/v1/*` routes
- `src/replication.ts` — outbound replication: clock fetch, diff, pull, push
- `src/auth.ts` — request signing and verification
- `src/foaf.ts` — FOAF radius query
- `src/live.ts` — SSE stream management

**Interop:** The Deno node replicates with Node.js sbots via the Phase 1 HTTP
transport. Message format is identical; signatures are cross-verified.

---

## What Does Not Change

- SSB message format and hash/signature scheme
- The Ed25519 keypair identity model
- Offline-first behavior (HTTP clients queue and retry on reconnect)
- Wide replication (FOAF gating is opt-in policy, not protocol-level)
- The pub model (pubs just run the HTTP server and accept all peers)
- Direct peer sync on local networks (mDNS discovery + HTTP to local IP)
- Compatibility with existing SSB clients (they use muxrpc, which stays)
- The Decent browser UI (connects to whichever sbot is local)

---

## Open Questions

1. **Peer discovery over HTTP** — how do HTTP-only peers find each other?
   mDNS still works on LAN. For WAN, a simple gossip endpoint
   (`GET /ssb/v1/peers` returning known peer URLs) may be sufficient.

2. **Invite codes** — current invite format encodes a multiserver address.
   Need an HTTP-native invite format, e.g. `https://host:8990/invite/:token`.

3. **Private messages** — encrypted content passes through unchanged.
   No protocol changes needed; private messages are opaque blobs to the transport.

4. **Conflict with ssb-ooo** — out-of-order message fetching may need adjustment
   for the HTTP pull model. Worth reviewing.

5. **Rate limiting** — the HTTP surface is more easily hammered than muxrpc.
   Basic rate limiting by `keyId` is recommended from the start.
