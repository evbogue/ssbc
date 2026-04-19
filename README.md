# Secure-Scuttlebot Classic

Secure Scuttlebutt is a peer-to-peer protocol built on signed, append-only personal logs.
Your feed lives on your own computer. Messages gossip between nodes over the network.
There is no central server and no algorithmic feed.

`ssbc` keeps alive what Dominic Tarr, Paul Frazee, Charles Lehner, and Everett Bogue built.
Dominic designed the SSB protocol, wrote scuttlebot — the server at the heart of this repo —
and originated Patchbay; Paul created Patchwork, the original SSB desktop client; Charles built
git-ssb; and Everett forked Patchbay into Decent in 2016. The project was abandoned in 2024.
This is the continuation.

Try it before installing: [decent.evbogue.com](https://decent.evbogue.com/)

<!-- screenshot: docs/img/feed.png -->

---

## What you can do

- Post and read a social feed stored on your own computer
- Follow people and build a social graph that syncs across peers
- Send end-to-end encrypted private messages
- Share files through the network as blobs
- Host git repositories on your SSB node — no GitHub required
- Join networks by accepting an invite code from a pub

---

## Requirements

- **Node.js ≥ 22.5** (uses `node:sqlite` built-in)
- `npm`
- `git` on `PATH` (required for the git smart HTTP server)

---

## Installation

```bash
npm install
```

This installs all dependencies and makes the `sbot` / `ssb-server` commands available within the project.

---

## Getting Started

### 1. Start the Server

```bash
npm start
# equivalent to: node bin.js start
```

Output:
```
ssb-server <version> <path> logging.level:<level>
my key ID: <@yourPublicKey>
Decent launched at http://127.0.0.1:8888/
```

Leave this terminal open. Run all other commands in a **separate terminal**.

### 2. Use the CLI

```bash
node bin.js whoami          # your public key
node bin.js gossip.peers    # connected peers
node bin.js help            # list all commands
node bin.js help <command>  # detail on a specific command
```

### 3. Connect to the Network

To receive messages from others, accept an invite code from a pub:

```bash
node bin.js invite.accept "PASTE_INVITE_CODE_HERE"
```

### 4. Create Invites

```bash
node bin.js invite.create 1   # single-use invite
node bin.js invite.create 5   # multi-use invite
```

---

## Git over SSB

Your git repositories live in your SSB log. Anyone who follows you can clone them.
No GitHub, no GitLab, no server to admin — just your node and the network.

<!-- screenshot: docs/img/git-forge.png -->

### Create a repo

```bash
node bin.js git.create my-project
# → "http://127.0.0.1:8888/git/%25<id>.sha256"
```

### Use it as a git remote

```bash
git remote add ssb http://127.0.0.1:8888/git/%25<id>.sha256
git push ssb main
git clone http://127.0.0.1:8888/git/%25<id>.sha256
```

Standard git operations (push, fetch, clone, branches) all work against this remote. The repo URL contains the SSB message ID of the `git-repo` message — share it with others on the network and they can clone it once their node has the blobs.

Decent includes a git-forge UI for browsing repos, branches, and commits in the browser.

---

## Web UI (Decent)

The Decent browser UI is built from `decent/` and served by `plugins/decent-ui.js` on port `8888`.

### Build

```bash
npm run build:web
```

Build output: `decent/build/index.html`, `decent/build/style.css`

### Access

With the server running, open **http://127.0.0.1:8888/**

Archived Scuttlebot documentation is also served at:

- **http://127.0.0.1:8888/docs**

Those docs are served from `docs/scuttlebot.io/`. Their vendored source lives in
`vendor/scuttlebot.io/`, and you can resync generated output with:

```bash
npm run sync:scuttlebot-docs
```

To run on a different port, pass overrides after `--`:

```bash
node bin.js start -- --port 9009 --ws.port 9989
```

Or set them permanently in `~/.ssb/config`:

```json
{
  "decent": {
    "host": "127.0.0.1",
    "port": 8888
  }
}
```

---

## Architecture

`ssbc` is a SQLite-backed message store connected to a secret-stack RPC surface, with a WebSocket bridge for browser clients, a git-over-HTTP plugin, and the Decent frontend served from the same port. The pieces are documented separately:

- [`docs/overview.md`](docs/overview.md) — what the pieces are
- [`docs/architecture.md`](docs/architecture.md) — how they fit together
- [`docs/api.md`](docs/api.md) — RPC surface and message shapes
- [`docs/cli.md`](docs/cli.md) — full command reference
- [`docs/frontend.md`](docs/frontend.md) — Decent internals
- [`docs/http-replication.md`](docs/http-replication.md) — replication protocol

Archived scuttlebot reference docs are served locally at `http://127.0.0.1:8888/docs` but `docs/` is the primary source of truth for how this repo works now.

---

## What changed from classic scuttlebot

- `node:sqlite` replaces flume and all native dependencies — no more build failures on modern Node
- Message storage is SQLite-backed; the flume indexes are gone
- HTTP replication is available alongside the classic muxrpc transport
- The `sbot` / `ssb-server` CLI and most classic plugin commands are preserved

---

## Contributing and license

See [`AGENTS.md`](AGENTS.md) for development conventions.

MIT
