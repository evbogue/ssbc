# Work Order: Reconcile scuttlebot.io docs with current ssbc behavior

**Status:** Not started
**Scope:** Audit and reconcile drift between the archived scuttlebot.io documentation served at `/docs` and the actual behavior of this repository.
**Goal:** Make it clear which docs still accurately describe current behavior, which docs are historical, and which commands/APIs need correction or explicit caveats.

## Why this exists

This repo now vendors the original `scuttlebot.io` source and serves generated output at `/docs`, but the running code is no longer a pristine historical scuttlebot.
It is a modernized `ssbc/ssb-server` variant with a SQLite-backed DB layer, updated CLI help, ws/browser affordances, and selective compatibility shims.

That means the docs can silently drift from reality.

The right outcome is **not** necessarily "make the code match the old docs." In many places the code is intentionally newer or different. The job is to identify:

1. docs that are still correct,
2. docs that are wrong for this repo,
3. docs that describe legacy behavior and need a banner or note,
4. code paths that accidentally drifted and should be brought back in line.

## Initial findings from this audit

These are the concrete drift areas already identified.

### 1. `version` docs drift

Archived docs:
- `docs/scuttlebot.io/docs/config/get-current-version.md`
- describes `sbot version` returning a real semantic version like `7.6.5`

Current code:
- `lib/db.js` returns `version() { return '1.0.0' }`

This is misleading for users of this repo. `1.0.0` is the SQLite DB wrapper/plugin version, not a truthful statement of the overall server version users expect from the docs.

**Decision needed:**
- either document that `version` in this repo is implementation-defined and no longer matches historical scuttlebot,
- or change `version()` to return something more meaningful for the running server.

### 2. `createFeedStream` docs drift

Archived docs say:
- `createFeedStream` supports range filtering (`gt/gte/lt/lte`) against claimed timestamps.

Current code in `lib/db.js`:
- `createFeedStream()` sorts by `ts`
- but ignores `gt/gte/lt/lte`
- only `limit` and `reverse` are applied

This is real behavioral drift and should probably be fixed in code or called out explicitly.

### 3. `latest` docs drift

Archived docs:
- `latest` gets latest messages / seqs for all users in the database.

Current CLI help in `lib/cli-help.js` says:
- "Stream the latest sequence seen for every feed that this server follows."

Current code in `lib/db.js`:
- returns latest known sequence for every author in the database, regardless of follow state

So the implementation is closer to the archived docs than the current CLI help text.
This looks like **help text drift**, not code drift.

### 4. invite docs likely drift in wording and shape

Archived invite docs describe classic `create / accept / use` behavior in generic scuttlebot terms.

Current code in `plugins/invite/index.js` adds repo-specific behavior and nuance:
- legacy and modern invite handling
- ws-address preference for `modern` invites
- optional rejection of private/non-public addresses
- automatic follow publication on accept
- publication of `pub` messages in some accept flows

The high-level behavior still matches, but the docs almost certainly under-describe the actual behavior of this repo.
This may need repo-specific notes rather than a full rewrite.

### 5. browser client docs are historically correct but incomplete for this repo

Archived docs in `docs/scuttlebot.io/docs/basics/open-a-client.md` say the API client is only available for Node.js applications.

For this repo, browser clients also connect through the Decent UI via `ssb-ws`/websocket affordances and anonymous browser-safe permissions configured in `index.js` plus `plugins/decent-ui.js`.

The archived statement is historically understandable, but it is incomplete or misleading for this repo as served.

### 6. command surface has expanded beyond the archived docs

Current command list includes modern or repo-specific surfaces such as:
- `list-commands`
- `config`
- `status`
- `progress`
- `multiserver.parse`
- `multiserver.address`
- `multiserverNet`
- `decentUi`
- `frontend`

The archived docs are not wrong for omitting these, but `/docs` currently looks authoritative while not documenting the full command surface of this repo.

### 7. compatibility stubs and historical docs need explicit framing

Current code includes compatibility layers and caveats, for example:
- `query.read` exists, but AGENTS/notes say `sbot.query.read` returns empty results in this setup and should not be relied on
- `links2.read` is exposed
- `replicate`/`ebt` coexist in command listings, but implementation semantics differ from older assumptions
- `whoami`, `messagesByType`, `createUserStream`, etc. are preserved through a new SQLite-backed implementation

This is exactly the kind of place where users need a banner saying:
- these docs are an archived foundation,
- not a perfect spec for this repo.

## Recommended approach

Do this in phases. Do not try to rewrite the entire docs tree in one pass.

### Phase 1: Add framing so the docs stop over-claiming

Add a visible note near `/docs` entry points and/or in the served docs wrapper clarifying:
- these are archived scuttlebot.io docs,
- they are useful reference,
- they may not exactly match the behavior of this repository,
- repo-specific behavior should defer to local README/help/manifests.

This is the highest-value, lowest-risk fix.

### Phase 2: Fix the most misleading mismatches

Address the drift that will actually confuse users right away:
- `version`
- `createFeedStream`
- `latest` help text
- browser client wording vs ws-enabled reality

For each mismatch, decide whether the right fix is:
- code change,
- docs change,
- or a compatibility note.

### Phase 3: Write repo-specific supplements instead of rewriting the archive

Prefer adding small repo-local companion docs over rewriting hundreds of archived pages.

Good candidates:
- `docs/repo-api-notes.md`
- `docs/scuttlebot-archive-status.md`
- command-specific caveat pages for invite/query/browser access

### Phase 4: Optional deeper audit

If still worthwhile, perform a more systematic command-by-command diff between:
- archived docs in `docs/scuttlebot.io/`
- current manifest / `list-commands`
- actual behavior in `lib/db.js`, `plugins/`, and CLI help

This should produce a table like:
- command/API
- archived doc status: accurate / partial / stale / missing
- recommended action

## Concrete tasks

1. Add an archive-status note so `/docs` is framed as historical reference, not perfect truth.
2. Decide what `version()` should return in this repo.
3. Fix `createFeedStream()` or document that timestamp range filters are unsupported.
4. Fix `latest` CLI help text to match implementation.
5. Add repo-specific notes for browser access and invite behavior.
6. Decide whether `query.read` should be documented as unsupported/degraded in this setup.
7. Create a small matrix of the highest-traffic commands/APIs and mark drift explicitly.

## Constraints

- Do not casually rewrite the entire scuttlebot.io archive.
- Preserve the archive as reference material where possible.
- Prefer additive notes and precise corrections over broad modernization.
- If code and archived docs disagree, do not assume the docs win. Decide case by case.

## Deliverable

A documented, repo-specific reconciliation layer so users can tell:
- what the archived docs mean,
- where they still apply,
- and where this repo intentionally differs.
