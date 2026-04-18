# CLI

This document describes the current command-line surface of this repository.

The CLI entrypoint is:

```bash
node bin.js <command>
```

When installed globally, the same surface is exposed through the package binaries.

## Most common commands

### Start the server

```bash
node bin.js start
```

This starts the SSB server, HTTP UI, websocket support, and loaded plugins.

You can pass config overrides after `--`:

```bash
node bin.js start -- --port 9009 --ws.port 9989
```

### Identify the current feed

```bash
node bin.js whoami
```

### Inspect peers

```bash
node bin.js gossip.peers
```

### Create invites

```bash
node bin.js invite.create 1
node bin.js invite.create 5
```

### Rebuild the web UI

```bash
npm run build:web
```

### Resync archived scuttlebot docs from vendored source

```bash
npm run sync:scuttlebot-docs
```

## Command groups

The exact command list is available with:

```bash
node bin.js list-commands
```

In practice, the command surface falls into a few main groups.

### Core message and feed commands

These cover message publication and reading:
- `add`
- `publish`
- `get`
- `latest`
- `latestSequence`
- `getLatest`
- `createLogStream`
- `createFeedStream`
- `createUserStream`
- `createHistoryStream`
- `createSequenceStream`
- `messagesByType`
- `links`

### Blob commands

These cover content-addressed file storage:
- `blobs.add`
- `blobs.get`
- `blobs.ls`
- `blobs.has`
- `blobs.want`
- `blobs.meta`
- `blobs.changes`
- `blobs.createWants`

### Social graph commands

These cover follows, blocks, and graph inspection:
- `friends.hops`
- `friends.get`
- `friends.onEdge`
- `friends.help`

### Gossip and replication commands

These cover peers and replication-related surfaces:
- `gossip.peers`
- `gossip.get`
- `gossip.ping`
- `gossip.help`
- `ebt.replicate`
- `ebt.request`
- `ebt.block`
- `ebt.peerStatus`
- `ooo.stream`

### Invite commands

These cover invite creation and acceptance:
- `invite.create`
- `invite.use`
- `invite.help`

### Configuration and discovery commands

These cover server identity and surface inspection:
- `config`
- `address`
- `manifest`
- `version`
- `help`
- `list-commands`
- `multiserver.parse`
- `multiserver.address`
- `multiserverNet`

## How command help works

The repo includes curated CLI help entries in `lib/cli-help.js`.

For many commands, the fastest way to understand current usage is:

```bash
node bin.js help <command>
```

Examples:

```bash
node bin.js help publish
node bin.js help gossip.peers
node bin.js help invite.create
```

## Notes on current behavior

### Prefer current working surfaces

The CLI should be understood in terms of the current implementation in this repo.

In particular, current workflows should prefer the APIs and commands that are backed by the current database layer, such as:
- `messagesByType`
- `links`
- `createUserStream`
- `createLogStream`

### Legacy query-related surfaces

Some legacy or compatibility-oriented command/API surfaces may still appear in manifests or command listings.
If they are not part of the intended primary interface of this repo, they should not be treated as the main way to use the system.

The primary docs should focus on the current supported path, not on legacy indexing internals.

## Recommended mental model

Use the CLI for three main jobs:
- running the node,
- inspecting message/feed/blob/social state,
- interacting with the node’s exposed SSB surfaces.

For web use, the CLI and the HTTP UI are complementary:
- CLI for direct inspection and operations,
- Decent for browser-based usage.
