# Work Order: Align current docs with the implemented ssbc behavior

**Status:** Not started
**Intent:** Finish the transition to repo-current documentation without reviving legacy internals that are no longer needed.

## Goal

Make the documentation describe the current implementation directly.

Do not spend effort restoring old behavior unless there is a real present-day need for it.
The job is to make the docs truthful, comprehensive, and current.

## What has already been done

The repo now has a current docs spine:
- `docs/overview.md`
- `docs/architecture.md`
- `docs/cli.md`
- `docs/api.md`
- `docs/frontend.md`

The archived scuttlebot docs are still available as reference, but they are no longer the center of the documentation strategy.

## What remains to do

### 1. Tighten the current docs with concrete behavior

Expand the new docs pages with:
- real command examples
- practical API examples
- clearer notes on what is actually supported now
- links between overview, CLI, API, and frontend docs

### 2. Align descriptions with implementation where docs would otherwise lie

Check current docs against implementation and update docs first.
Only change code if a real user-facing behavior is incorrect or misleading enough that documentation alone is not enough.

Current known items:
- `createFeedStream` should be documented as it behaves now, not as older docs described it
- `version()` semantics should be evaluated and documented clearly
- CLI help text should be reviewed for mismatches with current behavior

### 3. De-emphasize legacy/internal-only surfaces

Do not center docs around legacy internals such as:
- `query.read`
- `links2.read`
- old indexing assumptions tied to historical implementations

If they are still present, mention them briefly only when necessary.
They are not the main story of how this repo works.

### 4. Add docs maintenance guidance

Create a short maintenance page that explains:
- current docs in `docs/` are the primary source of truth
- archived docs in `docs/scuttlebot.io/` are reference material
- vendored scuttlebot source lives in `vendor/scuttlebot.io/`
- archived docs are regenerated with `npm run sync:scuttlebot-docs`

### 5. Review README and entry points

Make sure the main repo entry points direct readers to the current docs first.
If there are any remaining places that treat the archive as the main docs set, update them.

## Non-goals

- Do not restore legacy internals just because older docs mentioned them.
- Do not rewrite the entire archived scuttlebot docs set.
- Do not add compatibility theater for features nobody uses.

## Deliverable

A documentation set that accurately explains how `ssbc` works now, with historical materials kept only as secondary reference.
