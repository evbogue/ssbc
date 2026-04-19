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

### 5. Config overrides

Pass config overrides after `--`:

```bash
node bin.js start -- --port 9009 --ws.port 9989
node bin.js whoami -- --port 9009
```

---

## Web UI (Decent)

The Decent browser UI is built from `decent/` and served by `plugins/decent-ui.js` on port `8888`.

### Build

```bash
npm install
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

Override host/port in `~/.ssb/config`:

```json
{
  "decent": {
    "host": "127.0.0.1",
    "port": 8888
  }
}
```

---

## Git Smart HTTP Server

The server exposes a git smart HTTP remote on the same port as the Decent UI (default `8888`). Git objects are stored as SSB blobs; ref state is tracked in signed SSB messages.

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

---

## Current Docs

For repo-current documentation, start with:

- `docs/overview.md`
- `docs/architecture.md`
- `docs/cli.md`
- `docs/api.md`
- `docs/frontend.md`

Archived scuttlebot reference docs are also served locally at `/docs`, but the files in `docs/` are the primary source of truth for how this repository works now.

MIT
