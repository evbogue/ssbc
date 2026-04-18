# Secure-Scuttlebot Classic

`ssbc` is a modern continuation of the classic Secure Scuttlebutt model.

It preserves the parts that still matter in practice:

- signed append-only personal feeds
- peer-to-peer replication
- blob storage and file sharing
- invite-based network access
- local ownership of data and identity

This repository combines an SSB server, a built-in browser client called Decent, and a git-over-SSB workflow.
The goal is not to re-imagine the protocol. The goal is to keep the useful classic behavior working on a modern Node.js stack.

### Classic rationale

Classic SSB clients stopped keeping pace with modern Node.js. `ssbc` exists to preserve the original operating model in a form that still runs, still syncs, and still exposes familiar `sbot` / `ssb-server` workflows.

Decent is included as the built-in local web client, and the git-over-SSB support remains part of the project because it demonstrates that the signed, replicated SSB model is useful for more than social posts.

This repo is maintained by Everett Bogue. Stronger personal arguments for why SSB matters may appear in Everett's own posts and comments, but the README and project docs should stay grounded in the software's actual behavior and scope.

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
