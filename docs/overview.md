# Overview

`ssbc` is a Secure Scuttlebutt server and web UI stack built around a modernized local implementation while preserving the core SSB model.

At a high level, this repository provides:
- an SSB server process with a familiar RPC/CLI surface,
- a SQLite-backed message database,
- websocket/browser access for local web clients,
- the Decent browser UI,
- a git-over-HTTP bridge backed by SSB messages and blobs,
- and archived scuttlebot reference docs served locally at `/docs`.

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

### 3. Decent web UI

The Decent frontend lives in `decent/` and is served by `plugins/decent-ui.js`.

By default, the UI is available at:
- `http://127.0.0.1:8888/`

The same HTTP server also serves:
- blob upload/download routes,
- the git smart HTTP endpoints,
- archived docs at `/docs`.

### 4. Browser/websocket access

This repo explicitly supports browser-facing access patterns for the web UI.

The server exposes websocket-compatible access for local/browser clients, and the Decent UI bootstraps the client connection details it needs at runtime.

### 5. Git over SSB

`plugins/git-server.js` exposes a git smart HTTP remote on the same server used for Decent.

This lets the repo use SSB messages and blobs as storage for git repositories while preserving ordinary git push/fetch/clone workflows over HTTP.

### 6. Archived scuttlebot reference docs

The archived scuttlebot docs are served at:
- `/docs`

These are useful reference material, but they are not the primary source of truth for how this repository works now. The current docs in `docs/` should describe the current implementation directly.

## Typical flow

A normal local run looks like this:

1. start the server with `node bin.js start`
2. open Decent in the browser
3. connect through websocket/browser-safe access
4. read and publish messages from the local node
5. optionally use blob, invite, gossip, social, and git features through the same server

## Where to look next

- `docs/architecture.md` for how the pieces fit together
- `README.md` for setup and command examples
- `docs/frontend.md` for Decent-specific details (to be expanded)
- `docs/api.md` for current RPC/API behavior (to be expanded)
