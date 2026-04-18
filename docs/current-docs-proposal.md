# Proposal: Document the current ssbc implementation directly

**Status:** Proposed
**Intent:** Replace drift-prone, archive-centered documentation with comprehensive documentation of how this repository works now.

## Core decision

The docs for this repo should describe the **current implementation and current behavior**.

They should not spend much energy explaining how classic scuttlebot used to work internally unless that context is required to understand current behavior.

The purpose of the docs is to help someone:
- run this repo,
- use its commands and APIs,
- understand its architecture,
- build against it,
- and modify it safely.

That means the source of truth should be the current codebase, not the historical scuttlebot docs.

## What to optimize for

1. **Current truth over historical fidelity**
   - If the code works a certain way now, document that.
   - Do not preserve old explanations just because they existed first.

2. **Behavior over implementation nostalgia**
   - We care about replicating what the system does, not preserving the old flume/query/links2 internals.
   - If SQLite replaced old indexing internals, the docs should simply describe the SQLite-backed behavior.

3. **Comprehensive, repo-specific docs**
   - Someone should be able to understand this repo without needing the archived scuttlebot site.

4. **Minimal historical framing**
   - If we keep the archive at all, it should be treated as background reference, not the main docs set.
   - Avoid littering the docs with "it used to work like X" unless that directly clarifies a migration hazard.

## Proposed documentation structure

Create or expand a current docs layer under `docs/` that stands on its own.

### 1. `docs/overview.md`

Explain:
- what this repo is
- what server it runs
- what Decent is
- what protocols/transports are exposed
- what is served over HTTP
- the high-level architecture

This should be the first document a new reader opens.

### 2. `docs/architecture.md`

Describe the current architecture plainly:
- SQLite-backed DB layer
- plugin system
- Decent frontend
- HTTP routes
- git server integration
- websocket/browser access
- replication pieces currently in play

No long digressions into legacy internals unless strictly necessary.

### 3. `docs/cli.md`

Document the current CLI as it exists now.

Include:
- main commands
- important subcommands
- examples that actually work in this repo
- config override patterns

This should be derived from actual command surface and tested examples.

### 4. `docs/api.md`

Document the current RPC/API behavior:
- core message methods
- blobs
- friends
- gossip
- invite
- replication-related surfaces
- browser/websocket-facing access where relevant

If a method exists but is not recommended, say so clearly and briefly.
Do not preserve old internals just for completeness.

### 5. `docs/frontend.md`

Document Decent specifically:
- build flow
- runtime model
- routing
- blob handling
- ws connection behavior
- source layout
- plugin/module system

### 6. `docs/docs-maintenance.md`

Document how documentation itself works now:
- current docs written in this repo
- archived scuttlebot docs served at `/docs`
- vendored scuttlebot.io source in `vendor/scuttlebot.io/`
- sync workflow for archive regeneration

Keep this operational and short.

## What to do with the archived docs

Do **not** treat `docs/scuttlebot.io/` as the main documentation set for this repo.

Recommended approach:
- keep serving it if useful as reference material,
- but clearly subordinate it to the repo-current docs,
- and avoid spending major energy reconciling every old page unless it still matters.

A short label is enough:
- archived reference docs
- not the primary source of truth for this repository

But the main effort should go into writing the new docs, not into annotating history.

## What not to document as primary interfaces anymore

Unless they are intentionally revived as first-class supported surfaces, stop centering docs around:
- `query.read`
- `links2.read`
- old flume-style indexing assumptions

If these exist only as compatibility remnants, they should either:
- disappear from primary docs, or
- be mentioned once in a caveats section

They should not shape the main explanation of how the system works.

## Implementation changes that may still be worth doing

Documentation should be the priority, but a few code/help fixes may still be justified because they affect the truthfulness of the docs.

Current likely candidates:

1. **`createFeedStream` behavior**
   - docs and likely user expectations imply timestamp range filtering
   - current implementation appears not to honor all range filters
   - this is a behavior mismatch, not just a documentation mismatch

2. **`version()` output**
   - current `1.0.0` result is not very informative for users
   - this may need a more meaningful implementation or clearer semantics

3. **CLI help text cleanup**
   - some help text appears to describe behavior that does not exactly match implementation
   - this is low-cost and worth aligning

These should be fixed when they block accurate docs. Otherwise, document carefully and move on.

## Suggested execution plan

### Phase 1: establish the current docs set

Write the new core docs:
- `overview.md`
- `architecture.md`
- `cli.md`
- `api.md`
- `frontend.md`
- `docs-maintenance.md`

This is the most important phase.

### Phase 2: make the docs trustworthy

As the new docs are written, fix the most visible code/help mismatches that would force the docs to lie.

Likely targets:
- `createFeedStream`
- `version`
- selected CLI help text

### Phase 3: de-emphasize the archive

Keep the archive available, but make sure readers encounter the current docs first.

Possible tactics:
- link current docs prominently from README
- link current docs from the Decent/docs UI entrypoint if desired
- add only a minimal archive label, no huge history essay

## Deliverable

A documentation set that fully explains how this repository works **now**, with minimal dependence on historical scuttlebot material.

## Bottom line

The docs should stop asking readers to mentally translate from classic scuttlebot into this repo.
The docs should simply explain this repo directly.
