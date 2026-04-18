# Secure-Scuttlebot Classic

sbotc is an open source **peer-to-peer log store** used as a database, identity provider, and messaging system.
It has:

 - Global replication
 - File-synchronization
 - End-to-end encryption

`ssb-server` behaves just like a [Kappa Architecture DB](http://milinda.pathirage.org/kappa-architecture.com/).
In the background, it syncs with known peers.
Peers do not have to be trusted, and can share logs and files on behalf of other peers, as each log is an unforgeable append-only message feed.
This means ssb-servers comprise a [global gossip-protocol mesh](https://en.wikipedia.org/wiki/Gossip_protocol) without any host dependencies.

### Classic rationale

SSB was abandoned in 2024; this is an attempt to restore the original "classic" functionality. You can find the original project documentation at [scuttlebot.io](https://scuttlebot.io). This repo is maintained by Everett Bogue — reach out via [evbogue.com](https://evbogue.com/) with any questions.

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
# equivalent to: node bin start
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
node bin whoami          # your public key
node bin gossip.peers    # connected peers
node bin help            # list all commands
node bin help <command>  # detail on a specific command
```

### 3. Connect to the Network

To receive messages from others, accept an invite code from a pub:

```bash
node bin invite.accept "PASTE_INVITE_CODE_HERE"
```

### 4. Create Invites

```bash
node bin invite.create 1   # single-use invite
node bin invite.create 5   # multi-use invite
```

### 5. Config overrides

Pass config overrides after `--`:

```bash
node bin start -- --port 9009 --ws.port 9989
node bin whoami -- --port 9009
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
node bin git.create my-project
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

Archived scuttlebot reference docs are also served locally at `/docs`, but the files in `docs/` are the primary source of truth for how this repository works now.

MIT
