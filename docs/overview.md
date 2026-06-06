# Overview

`ssbc` is a Secure Scuttlebutt server and web UI stack built around a modernized local implementation while preserving the core SSB model.

At a high level, this repository provides:
- an SSB server process with a familiar RPC/CLI surface,
- a SQLite-backed message database,
- websocket/browser access for local web clients,
- the Decent browser UI, plus ssbski, a second skin of the same UI,
- a git-over-HTTP bridge backed by SSB messages and blobs,
- this repository's current documentation served locally at `/docs`, with the
  historical scuttlebot manual at `/docs/archive`.

## What this repo is for

This repo is designed to let you:
- run an SSB node,
- inspect and publish SSB messages,
- connect local or browser-based clients,
- browse and post through Decent,
- store and fetch blobs,
- use the social graph and invite system,
- and expose git repositories over HTTP using SSB as the storage layer.

The goal of the project is not to preserve every historical internal implementation detail of classic scuttlebot. The goal is to preserve and evolve the useful behavior of the system in a form that is maintainable in this repository.

## Main pieces

### 1. SSB server

The server is created with `secret-stack` in `index.js` and started through `bin.js`.

It exposes a familiar set of SSB-style methods such as:
- `get`
- `publish`
- `createLogStream`
- `createUserStream`
- `messagesByType`
- `links`
- `latest`
- `getLatest`
- `whoami`

## 2. SQLite-backed database layer

The core message store lives in `lib/db.js`.

This is the main local data implementation used by the repo now. It provides the current source of truth for message storage and read APIs.

The important practical consequence is that this repo should be documented in terms of its current database-backed behavior, not in terms of historical flume/index internals.

### 3. Web UI: Decent and ssbski

The frontend lives in `decent/` and ships in two skins:

- **Decent** — the classic client, served by `plugins/decent-ui.js` (default `http://127.0.0.1:8888/`).
- **ssbski** — a Bluesky-style skin served by `plugins/ssbski-ui.js` (default `http://127.0.0.1:8990/`).

Both skins are the same JavaScript bundle pointed at the same local SSB node; only the
stylesheet differs (`style.css` vs `ssbski-style.css`). `npm run build:web` produces both.
The two public instances on the network are
[decent.evbogue.com](https://decent.evbogue.com/) and
[ssbski.evbogue.com](https://ssbski.evbogue.com/).

The same HTTP server (per skin) also serves:
- blob upload/download routes,
- the git smart HTTP endpoints,
- current documentation at `/docs` and the historical archive at `/docs/archive`.

### 4. Browser/websocket access

This repo explicitly supports browser-facing access patterns for the web UI.

The server exposes websocket-compatible access for local/browser clients, and the Decent UI bootstraps the client connection details it needs at runtime.

### 5. Git over SSB

`plugins/git-server.js` exposes a git smart HTTP remote on the same server used for Decent.

This lets the repo use SSB messages and blobs as storage for git repositories while preserving ordinary git push/fetch/clone workflows over HTTP.

### 6. Documentation

The running server serves this repository's current documentation at `/docs`,
rendered from the canonical Markdown pages in `docs/`. The original scuttlebot
manual is preserved as a clearly labelled historical archive at `/docs/archive`;
it is useful reference material but does not describe how this server works now.

See [`docs/docs-maintenance.md`](docs-maintenance.md) for how the documentation is
organized, served, and kept accurate.

## Typical flow

A normal local run looks like this:

1. start the server with `npm start` or `node bin.js start`
2. open Decent in the browser
3. connect through websocket/browser-safe access
4. read and publish messages from the local node
5. optionally use blob, invite, gossip, social, and git features through the same server

## Where to look next

- `docs/architecture.md` for how the pieces fit together
- `README.md` for setup and command examples
- `docs/frontend.md` for Decent and ssbski frontend details
- `docs/api.md` for current RPC/API behavior, and `docs/api-reference.md` for the
  generated reference of every built-in RPC method
