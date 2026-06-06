# Documentation maintenance

This page explains how the documentation in this repository is organized, served,
and kept accurate. It is itself one of the canonical pages served at `/docs`.

## Documentation hierarchy

When two sources disagree, trust them in this order:

1. Current code, tests, and runtime behavior
2. CLI help (`ssb-server help <command>`) and the generated API reference
3. `README.md` and the canonical current-behavior docs
4. The archived scuttlebot.io manual
5. Proposals and work orders

If documentation contradicts the code, verify the behavior and fix whichever is
wrong. Do not preserve inaccurate copy for historical continuity.

## Canonical pages and the `/docs` allowlist

These are the repository's current-behavior documents:

- `README.md`
- `docs/overview.md`
- `docs/architecture.md`
- `docs/api.md`
- `docs/api-reference.md` (generated)
- `docs/cli.md`
- `docs/frontend.md`
- `docs/docs-maintenance.md`

Only the pages in `DOC_PAGES` in [`lib/docs-renderer.js`](../lib/docs-renderer.js)
are exposed at `/docs/<slug>`. Work orders, proposals, and the historical archive
are deliberately **not** in that allowlist, so they cannot be published as current
documentation. When you add a canonical page, add its slug to `DOC_PAGES`; when you
add a proposal or work order, leave it out.

The following are **not** current-behavior documentation:

- `docs/scuttlebot.io/` — generated historical archive (served at `/docs/archive`)
- `vendor/scuttlebot.io/` — vendored source for that archive
- work orders and proposals (e.g. `docs/*-work-order.md`)
- `docs/http-replication.md` — a proposal for an unimplemented transport

## How `/docs` is served

Each UI server (Decent and ssbski) serves documentation through
[`lib/ui-server.js`](../lib/ui-server.js):

- `GET /docs` and `/docs/` render the current-docs index.
- `GET /docs/<allowed-slug>` renders the matching Markdown page. Pages are
  rendered with `markdown-it` (raw HTML disabled) by `lib/docs-renderer.js`, which
  rewrites relative `.md` links to `/docs/<slug>` through a custom link rule.
- `GET /docs/archive` and its descendants serve the vendored scuttlebot.io manual
  from `docs/scuttlebot.io/` with a visible historical-archive banner and
  archive-local links.
- Any other `/docs/*` path returns 404.

`ssb-markdown` is still used for rendering SSB posts in the UI; it is not used for
documentation because it rejects ordinary relative documentation links.

## Verifying claims against behavior

Before promoting or editing a canonical page:

- Run the relevant commands as written (installation, startup, common CLI
  commands, invite create/accept, git create/push/fetch/clone, `npm run build:web`).
- Prefer concrete commands, method shapes, routes, defaults, and file references
  over general description.
- Record any command that cannot be exercised safely or deterministically, and say
  why, rather than documenting assumed behavior.

## Regenerating and verifying the API reference

`docs/api-reference.md` is generated — never edit it by hand.

- Both server startup (`bin.js`) and the generator consume one ordered registry,
  [`lib/builtin-plugins.js`](../lib/builtin-plugins.js), so they cannot drift.
- Hand-written prose lives in `docs/api-notes.json`, keyed by fully-qualified
  method name (bare for the root database, namespaced for plugins).
- Regenerate after changing the plugin set or the notes:

  ```bash
  npm run gen:api-reference
  ```

- `test/api-reference.js` regenerates the reference in memory and byte-compares it
  with the committed file, asserts every RPC-bearing manifest method appears,
  checks the stubs and `git.create`, and confirms `bin.js` mounts through the
  shared registry. `test/builtin-plugins.js` adds a startup smoke test. Both run
  under `npm test`.

If a manifest test fails after you add or remove a plugin, regenerate the
reference and commit the updated `docs/api-reference.md`.

## Regenerating the scuttlebot.io archive

The archived manual under `docs/scuttlebot.io/` is generated from the vendored
source in `vendor/scuttlebot.io/`:

```bash
npm run sync:scuttlebot-docs
```

Treat it as historical reference, not current behavior.

## Feature work orders own feature docs

Feature-specific documentation stays in that feature's work order until the
feature lands. For example, `docs/git-identity-work-order.md` owns documentation
of the proposed `git-identity` message unless and until that feature is
implemented. Do not move proposed behavior into a canonical page before it is real.
