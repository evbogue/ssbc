# API

This document describes the current API surface of this repository at a practical level.

The repository exposes an SSB-style RPC surface through the server created in `index.js`, the database implementation in `lib/db.js`, and the loaded plugins wired by `bin.js`.

For a complete, generated listing of every built-in method with its RPC type, see
[`docs/api-reference.md`](api-reference.md). That reference is generated from the
server's static plugin manifests, so it covers the full built-in surface — the
root database plus every RPC-bearing built-in plugin. It deliberately **excludes**
two things: dynamically installed user plugins (loaded by `ssb-plugins` at
runtime), and non-manifest secret-stack core methods (such as `auth`, `address`,
and `multiserver`) that a live server adds but does not declare in a manifest. This
page covers the same surface at a more practical, hand-written level.

## Core message APIs

These are the main methods used to read and write message data.

### Writing

- `publish(content, cb)`
  - publish a new message using the current local identity
- `add(msg, cb)`
  - add a well-formed message directly to the local store

### Reading

- `get(msgId, cb)`
  - fetch one message by key
- `createLogStream(opts)`
  - stream messages ordered by local receive time
- `createFeedStream(opts)`
  - stream messages ordered by claimed timestamp; honors `gt`/`gte`/`lt`/`lte` range filters (on the timestamp), `limit`, `reverse`, and `live`
- `createHistoryStream(opts)`
  - stream messages from a specific feed ordered by sequence
- `createUserStream(opts)`
  - user/feed-specific stream interface
- `createSequenceStream()`
  - stream local sequence progress
- `messagesByType(opts)`
  - stream messages matching a content type
- `links(opts)`
  - traverse link relationships
- `latest()`
  - stream the latest sequence for every feed in the local database (not only followed feeds)
- `getLatest(feedId, cb)`
  - get latest message for a feed
- `latestSequence(feedId, cb)`
  - get the latest known sequence for a feed
- `whoami()`
  - return the current local feed id

## Blob APIs

Blob APIs support content-addressed file storage.

Common blob operations include:
- add a blob
- fetch a blob
- inspect blob presence and metadata
- stream blob changes/wants

These surfaces are available through the blobs plugin stack and are also exposed over HTTP routes by `plugins/decent-ui.js`.

## Social graph APIs

The friends plugin provides current graph-oriented behavior such as:
- `friends.hops`
- `friends.get`
- follow/block inspection
- friend-stream style graph traversal

These APIs are used to support both social behavior and replication decisions.

## Invite APIs

The invite plugin provides:
- invite creation
- invite acceptance
- invite use

In this repo, invite behavior should be understood from the current implementation in `plugins/invite/index.js`, not just from historical scuttlebot wording.

The implementation supports practical behavior such as:
- invite code creation
- acceptance flows that connect and request access
- follow publication on success
- modern/legacy invite handling in the current code path

## Gossip and replication-related APIs

The repo exposes peer and replication-related behavior through current plugin surfaces such as:
- gossip peer inspection
- EBT replication methods
- out-of-order stream helpers
- progress/status helpers

These methods are part of the live behavior of the running node and should be documented according to what the current implementation does.

## Browser-facing/API-adjacent access

This repo also supports browser-facing usage through Decent.

Important practical pieces:
- websocket-compatible access for the frontend
- anonymous/browser-safe permissions defined in `index.js`
- runtime remote bootstrapping injected by `plugins/decent-ui.js`

This matters because current users may interact with the API surface through the browser UI, not only through Node clients.

## HTTP-adjacent surfaces

While the main RPC surface remains SSB-style, the running server also exposes HTTP routes for related functionality:
- `/blobs/add`
- `/blobs/get/:hash`
- `/docs` (current documentation) and `/docs/archive` (historical scuttlebot manual)
- git smart HTTP routes

These are part of the effective public surface of the repo even when they are not traditional RPC methods.

## Current documentation rule

The API docs for this repository should describe:
- what methods are available now,
- what behavior they provide now,
- what is considered the primary supported path now.

They should not force readers to learn historical storage/index internals in order to understand how the current repository behaves.

## What not to center

Unless intentionally promoted back into first-class supported use, legacy indexing-oriented interfaces should not be the center of the API docs.

The main API documentation should instead emphasize the methods backed by the current implementation and current intended workflows.

### `query.read` is not backed by an index

`sbot.query.read` (the legacy `ssb-query` / jitdb surface) is registered only as a
no-op flume view in this repo and **returns an empty stream**. Do not rely on it for
reading messages. Use the methods backed by SQLite instead:

- filter by content type → `messagesByType({ type })`
- traverse references between messages/feeds/blobs → `links(opts)`
- stream a single feed → `createHistoryStream({ id })`
- stream everything by timestamp → `createFeedStream(opts)`

## Next expansion

This page should be expanded with:
- method-by-method examples
- argument/option summaries for the highest-traffic methods
- notes on current caveats where implementation and expectation differ
