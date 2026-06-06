# Work Order: Documentation overhaul and accuracy

**Status:** In progress
**Single source of truth:** This order consolidates all repository-wide README and
documentation work, including the former `docs-serving-work-order.md` and the earlier
`readme-prep`, `readme-overhaul`, `docs-alignment`, and `scuttlebot-doc-drift` orders.

Feature-specific documentation remains in its feature work order. For example,
`git-identity-work-order.md` owns documentation of the proposed `git-identity` message if
that feature is approved and implemented.

## Objective

Make the documentation explain how this repository works **now**.

A developer new to SSB should be able to:
- understand what `ssbc`, Decent, and ssbski are,
- install and run the server,
- use commands and supported APIs,
- understand the current architecture,
- find a complete built-in static RPC reference,
- and distinguish current behavior from historical reference material and proposals.

Accuracy is more important than breadth. Do not publish proposed, legacy, or assumed behavior
as current behavior.

## Documentation hierarchy

Use this order of authority:

1. Current code, tests, and runtime behavior
2. CLI help and generated built-in API reference
3. `README.md` and canonical current docs
4. Archived scuttlebot.io material
5. Proposals and work orders

When documentation and code disagree, verify behavior and either fix the documentation or,
only when justified, fix the implementation. Do not preserve inaccurate copy for historical
continuity.

## Canonical current docs

These are the repository's public current-behavior documents:

- `README.md`
- `docs/overview.md`
- `docs/architecture.md`
- `docs/api.md`
- `docs/api-reference.md` (generated)
- `docs/cli.md`
- `docs/frontend.md`
- `docs/docs-maintenance.md`

The following are **not** current-behavior documentation:

- `docs/scuttlebot.io/` — generated historical archive
- `vendor/scuttlebot.io/` — vendored source for that archive
- work orders and proposals
- `docs/http-replication.md` — proposal for an unimplemented transport

Do not link proposals from the README or serve them as canonical docs.

## Tone and editing rules

- Make defensible claims grounded in current repository behavior.
- Explain SSB terms the first time they appear.
- Prefer concrete commands, method shapes, routes, defaults, and file references.
- Keep historical framing brief and useful.
- Treat git-over-SSB as an important working capability, not a gimmick.
- Do not turn project documentation into manifesto or movement copy.
- Do not invent commands or features.
- Link to a focused canonical page rather than duplicating long explanations.

## Completed foundation

The following work is already landed and should be preserved:

- [x] README overhaul with project framing, quick start, git-over-SSB, UI overview,
  architecture links, screenshots, credits, and license
- [x] Live demo flow at `decent.evbogue.com` verified
- [x] README screenshots captured in `docs/img/`
- [x] README internal links verified at the time of the overhaul
- [x] `version()` returns the package version instead of a hard-coded plugin version
- [x] `createFeedStream` honors `gt`/`gte`/`lt`/`lte`
- [x] `latest` CLI help matches its implementation
- [x] `query.read` is documented as returning an empty stream in this setup

## Part 1: Audit current documentation

Audit every canonical page against code, tests, help output, and a running server before
promoting the pages at `/docs`.

### 1a. Remove inaccurate and proposed behavior

- Remove `docs/http-replication.md` from the README architecture links.
- Remove claims that HTTP replication is currently available.
- Remove stale wording that the archive is the primary `/docs` surface.
- Remove planning language such as "to be expanded" from canonical pages.
- Verify claims about storage, replication, WebSocket access, git-over-HTTP, Decent, and
  ssbski.

### 1b. Verify commands and defaults

Run every README command without modification where practical. Verify:

- installation and startup,
- printed local URLs and default/configured ports,
- common CLI commands,
- invite creation and acceptance,
- git repository creation, push, fetch, and clone,
- frontend build,
- archived-doc sync.

Record any command that cannot be safely or deterministically exercised and explain why.

### 1c. Strengthen canonical pages

Add concrete examples, supported option shapes, caveats, and cross-links where they help a
reader complete a real task. Prioritize:

- `docs/overview.md` as the first current-docs entry point,
- `docs/cli.md` for runnable commands and configuration overrides,
- `docs/api.md` for practical API behavior and non-manifest core/transport methods,
- `docs/architecture.md` for current components and data flow,
- `docs/frontend.md` for the Decent/ssbski runtime and build model.

Do not center current docs around `query.read`, `links2.read`, flume, or old indexing
assumptions. Mention legacy surfaces briefly only when needed.

## Part 2: Serve current docs at `/docs`

Make each UI server expose current repository documentation while retaining the historical
manual as a clearly labelled archive.

### 2a. Markdown renderer

Add `markdown-it` as a direct dependency for repository documentation. Keep `ssb-markdown`
for SSB post rendering; it is not suitable for docs because it rejects ordinary relative
documentation links.

The renderer must:

- rewrite canonical relative `.md` links to `/docs/<slug>` while preserving anchors,
- leave external links untouched,
- render headings and fenced code blocks,
- reject or neutralize raw HTML,
- wrap output in a small accessible HTML page with readable light/dark styles,
- include links to the docs index and historical archive.

Implement link rewriting through the renderer's link rule, not regex over rendered HTML.
Test relative links, anchors, external links, code blocks, and raw HTML handling.

### 2b. Public allowlist and routing

Expose only the canonical docs:

```js
const DOC_PAGES = [
  { slug: 'overview',         title: 'Overview' },
  { slug: 'architecture',     title: 'Architecture' },
  { slug: 'api',              title: 'API' },
  { slug: 'api-reference',    title: 'API reference (generated)' },
  { slug: 'cli',              title: 'CLI' },
  { slug: 'frontend',         title: 'Frontend' },
  { slug: 'docs-maintenance', title: 'Documentation maintenance' },
]
```

Routing:

- `/docs` and `/docs/` render an index of current docs plus a labelled archive link.
- `/docs/<allowed-slug>` renders the corresponding Markdown page.
- `/docs/archive` and descendants serve `docs/scuttlebot.io/` with a visible historical
  archive banner and archive-local links.
- Other `/docs/*` paths return 404, preventing work orders and proposals from being
  accidentally published.

Update README and canonical-page wording to describe `/docs` as current documentation and
`/docs/archive` as the historical scuttlebot.io manual.

## Part 3: Generate a complete built-in API reference

Generate the reference from the repository's built-in static manifests. This completeness
claim deliberately excludes dynamically installed user plugins and non-manifest secret-stack
methods; explain both boundaries in `docs/api.md` and the generated reference.

### 3a. Share the built-in plugin registry

Extract the built-in `.use(...)` entries from `bin.js` into one ordered shared registry, such
as `lib/builtin-plugins.js`. Server startup and API generation must consume the same registry.

The registry must distinguish:

- RPC-bearing modules,
- zero-manifest infrastructure/UI modules,
- stub and compatibility modules.

Preserve exact mount order. Because this changes server bootstrap as part of documentation
work, add a startup smoke test that confirms the server still produces the expected manifest.

### 3b. Coverage boundary and baseline

Include `lib/db` plus every RPC-bearing built-in registry entry. At the time of this order,
the audited baseline is **83 built-in static manifest methods**:

- root `lib/db`: 26
- `plugins`: 5
- `gossip`: 12
- `replicate`: 2
- `ebt`: 4
- `friends`: 9
- `blobs`: 13
- `invite`: 3
- `git`: 1
- `query`: 3
- `links2`: 2
- `ooo`: 3

Derive the count rather than hard-coding it. Include `plugins.*`, `git.create`, `ooo.*`, and
`replicate.*`. Clearly mark stubs and no-ops. Audit `links2.read` before assigning its status.

### 3c. Generator and prose sidecar

Create:

- `scripts/gen-api-reference.js`
- `docs/api-notes.json`
- generated and committed `docs/api-reference.md`
- npm script `gen:api-reference`

The generator must list every built-in static manifest method with namespace, RPC type, and
status. Hand-written summaries, arguments, and examples live in `docs/api-notes.json`.
Undocumented methods remain visible as `_Not yet documented._`, with a coverage count in the
generated footer.

Prioritize prose for:

1. the nine core methods currently missing from `docs/api.md`,
2. methods used by Decent, ssbski, and common CLI workflows,
3. remaining methods as they are touched.

### 3d. Drift guards

Add a test that:

- regenerates the reference in memory and byte-compares it with the committed file,
- asserts every RPC-bearing shared-registry manifest appears,
- includes stub modules and `git.create`,
- confirms `bin.js` mounts through the shared registry rather than maintaining a second list.

## Part 4: Documentation maintenance

Create `docs/docs-maintenance.md` explaining:

- the documentation hierarchy and canonical-page allowlist,
- how to verify claims against code and runtime behavior,
- how `/docs` and `/docs/archive` are served,
- how to regenerate and verify the API reference,
- how `docs/scuttlebot.io/` is regenerated from `vendor/scuttlebot.io/`,
- how feature work orders retain ownership of feature-specific docs until the feature lands.

## Testing and verification

- `npm test` passes.
- Every README command is exercised or explicitly accounted for.
- Each allowed `/docs/<slug>` returns rendered HTML.
- Non-allowlisted work orders and proposals return 404.
- Relative links, anchors, external links, fenced code, and raw HTML handling are tested.
- `/docs/archive` and a deep archive asset load with archive-local links and a visible banner.
- API-reference drift tests pass.
- Server-startup smoke test passes after registry extraction.
- `/docs`, `/docs/api-reference`, and `/docs/archive` are visually checked in light and dark
  mode.

## Non-goals

- Rewriting the archived scuttlebot.io manual
- Publishing proposals or work orders as current documentation
- Implementing `docs/http-replication.md`
- Documenting dynamically installed user plugins in the committed generated reference
- Documenting third-party libraries covered by the historical archive
- Adding a static-site generator or Markdown build step
- Onboarding UI changes; those belong in a separate feature work order

## Done when

- [ ] Every canonical page has been audited against current code and behavior.
- [ ] Every README command runs as written or has an explicit verification note.
- [ ] README and canonical docs contain no claim that the proposed HTTP replication layer is
  implemented.
- [ ] Canonical docs have practical examples, accurate caveats, and useful cross-links.
- [ ] `GET /docs` serves the current-docs index.
- [ ] Canonical pages render at allowlisted `/docs/<slug>` routes with working links and
  light/dark styles.
- [ ] Work orders and proposals return 404 under `/docs`.
- [ ] The scuttlebot.io archive works at `/docs/archive` with clear historical framing.
- [ ] Server startup and API generation consume one shared built-in plugin registry.
- [ ] The generated API reference covers every built-in static manifest method and clearly
  marks stubs.
- [ ] API-reference and startup drift guards pass under `npm test`.
- [ ] `docs/docs-maintenance.md` exists and describes the maintenance workflow.
- [ ] README and all canonical docs describe `/docs` and `/docs/archive` accurately.
