# Architecture

This document describes how the current `ssbc` repository is structured and how its major pieces interact.

## High-level structure

The system has five main layers:

1. **Server bootstrap and command entrypoints**
2. **Core database and RPC surface**
3. **Plugins for social, invites, blobs, ws, and git behavior**
4. **HTTP serving layer for Decent and related routes**
5. **Frontend code in Decent**

## 1. Server bootstrap

### `index.js`

`index.js` creates the SSB server with `secret-stack`.

It establishes:
- the SSB capability keys,
- the default anonymous/browser-safe permissions,
- and the root database plugin wiring.

### `bin.js`

`bin.js` is the CLI entrypoint.

It is responsible for:
- starting the server,
- loading configuration,
- wiring the plugin stack,
- generating the manifest,
- exposing command-line access to server methods.

This is the main path for running the node locally.

## 2. Core database layer

### `lib/db.js`

`lib/db.js` is the current core storage implementation.

It provides the main local server methods, including:
- message reads and writes,
- feed/history/log streams,
- type-based queries,
- links,
- latest-sequence helpers,
- status/progress helpers,
- vector clock helpers,
- lightweight compatibility hooks for other plugins.

This file is one of the most important pieces of the repository.

### Why it matters

Historically, SSB stacks often depended on older indexing layers and plugin-specific query machinery.
In this repository, the current implementation is centered on the database behavior exposed here.

That means architectural explanations should start from `lib/db.js` and current behavior, not from historical indexing assumptions.

## 3. Plugins

The repo uses plugins to extend the server with distinct features.

### Key plugin categories

#### UI and HTTP
- `plugins/decent-ui.js`
- `plugins/git-server.js`

These handle:
- the Decent HTTP UI,
- blob endpoints,
- docs serving,
- git smart HTTP routes,
- websocket attachment for browser clients.

#### Social and replication behavior
- `plugins/friends/`
- `plugins/invite/`
- replication-related plugins loaded by `bin.js`

These handle:
- follow/block graph behavior,
- hops calculations,
- invite creation/acceptance/use,
- replication coordination with the rest of the SSB stack.

#### Other SSB surfaces
Additional behavior is provided through loaded modules such as blobs, gossip, ws, private messaging, and replication-related packages.

## 4. HTTP serving layer

### `plugins/decent-ui.js`

This plugin is the HTTP entrypoint for the user-facing web experience.

It serves:
- the Decent bundle,
- `style.css`,
- blob upload/download routes,
- archived docs under `/docs`,
- git HTTP requests by delegating to the git server plugin.

It also attaches websocket handling to the HTTP server so the frontend can connect through the same general web surface.

### Routing summary

Important routes include:
- `/` → Decent UI
- `/blobs/add` → blob upload
- `/blobs/get/:hash` → blob fetch
- `/docs` → archived scuttlebot docs
- `/git/...` → git smart HTTP behavior

## 5. Frontend

### `decent/`

The frontend is a browser-based SSB client called Decent.

It is organized as a plugin-style frontend with modules declaring `needs` and `gives`, wired together at startup.

Important frontend characteristics:
- browserified build output
- plugin/module architecture
- websocket-based connection to the local sbot
- UI modules for feed, profile, git, search, blobs, and related behavior

## 6. Git integration

### `plugins/git-server.js`

This plugin exposes repositories over git smart HTTP while using SSB storage underneath.

Conceptually, it bridges:
- normal git client behavior,
- HTTP transport,
- SSB-backed storage and refs.

This means the same local server can act as:
- an SSB node,
- a web UI host,
- and a git remote endpoint.

## 7. Docs architecture

There are now two documentation layers in the repo:

### Current docs
- `docs/*.md`

These should describe how the repository works now.

### Archived docs
- `docs/scuttlebot.io/`
- source in `vendor/scuttlebot.io/`

These are historical/reference material and are served for convenience, but they should not be treated as the primary architectural spec for the repo.

## Practical mental model

If you are trying to understand the repo, the best order is:

1. `bin.js` to see how the server starts
2. `index.js` to see the server root and permissions
3. `lib/db.js` to understand current core data behavior
4. `plugins/decent-ui.js` to understand HTTP/web serving
5. `plugins/git-server.js` for git behavior
6. `decent/` for frontend behavior

## Design principle

The current architecture should be explained in terms of what the system does now:
- current command surface,
- current RPC behavior,
- current HTTP behavior,
- current frontend behavior,
- current database semantics.

That is more important than preserving explanations of legacy internals that are no longer the main implementation path.
