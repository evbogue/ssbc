# Work Order: Docs and README overhaul

**Status:** In progress
**Consolidates:** the prior `readme-prep`, `readme-overhaul`, `docs-alignment`, and `scuttlebot-doc-drift` work orders, which have been folded into this one and removed. This is the single source of truth for docs and README work.

---

## Part 1: Remaining prep

These must be done or decided before the README overhaul.

### 1a. Create `docs/img/`

Add `docs/img/.gitkeep` so the directory is tracked. Screenshots captured during the README overhaul live here.

### 1b. Confirm the live demo at decent.evbogue.com

Open `https://decent.evbogue.com/` in a private window and record what a first-time visitor actually sees:
- Does it land on a usable Decent feed, or a login/invite wall?
- Is there a public invite code worth linking from the README?
- Is there enough feed activity that screenshots from the live instance are richer than a fresh local node?

Record the answer in a short note before writing the README call-to-action copy. Do not guess.

### 1c. Decide: onboarding polish before or after README?

Two options:
1. Do the empty-state onboarding improvement first (see Part 3, task 3e), then write the README against the improved state.
2. Proceed to the README now and describe the current first-run experience honestly.

Either is valid. Pick one and note it here before proceeding.

---

## Part 2: README overhaul

Replace the current README with one that pays respect to SSB's origins, gets newcomers oriented, and shows how to use `ssbc` with Decent — including the git-SSB story.

### Audience

**Primary:** A developer who has never run an SSB node. Should finish the README understanding what the project is, why it exists, and how to try it — without being asked to buy into claims bigger than the software can support.

**Secondary:** A returning SSB user who wants to know what changed and whether their classic workflow still works.

Both readers should feel welcome.

### Tone

- Welcoming, not breathless. Excitement comes from the ideas, not adjectives.
- No emojis.
- No marketing filler. Every sentence teaches, orients, or invites action.
- Plain language. Explain SSB terms (feed, blob, pub, invite) the first time they appear.
- Short sentences. Short paragraphs. Code blocks for commands.
- Claims grounded in current repo behavior only.
- Do not turn the README into manifesto copy.

### Sections (in order)

**1. Hero**
- One-line tagline in human terms.
- Two or three sentences on what SSB is: an append-only log of signed messages, gossiped between peers, stored on each user's own computer. No central server, no algorithmic feed.
- Call-to-action link to `https://decent.evbogue.com/` based on the confirmed demo flow from Part 1b.
- One screenshot: `docs/img/feed.png` — Decent feed view, a few posts visible.

**2. Why ssbc exists**
- Credit Dominic Tarr for creating SSB and the original `scuttlebot`.
- Credit Paul Frazee for Patchwork and the ecosystem work that shaped classic SSB clients.
- State plainly: SSB was abandoned in 2024 and classic clients stopped working on modern Node.
- State ssbc's mission: restore classic behavior on a modern stack so the network keeps working. A preservation project, not a reimagining.

**3. What you can do**

Verb-first bullets, two to six words each:
- Post and read a social feed that lives on your own computer
- Follow people and build a social graph that syncs offline
- Send end-to-end encrypted private messages
- Share files through the peer network as blobs
- Host git repositories on your own node (see below)
- Join networks via invite codes from a pub

**4. Git over SSB (spotlight section)**

Frame it: a decentralized git host. Repositories live in your SSB log. Anyone who follows you can clone them. No GitHub, no GitLab, no server admin.

Walk through the real commands:
1. `node bin.js git.create my-project` — returns a URL
2. `git remote add ssb <url>` then `git push ssb main`
3. A peer clones the same URL and receives objects via blob replication

Mention Decent's git-forge UI briefly. Include `docs/img/git-forge.png`.

**5. Quick start**

Three-command path:
- Requirements: Node ≥ 22.5, git, npm
- `npm install`
- `npm start`
- Open the local Decent URL printed at startup (usually `http://127.0.0.1:8989/`)

One short paragraph on joining the network: `node bin.js invite.accept "<code>"`. Mention `decent.evbogue.com` as one public node for invites; avoid hard-coding an invite that will expire. Push detailed CLI usage to `docs/cli.md`.

**6. Using Decent**
- What it is: the built-in browser client, served by `plugins/decent-ui.js`.
- Where it lives: `decent/`.
- How to rebuild: `npm run build:web`.
- One screenshot: `docs/img/decent.png` — compose or profile view.
- One short paragraph on what newcomers see on first launch (based on actual state at time of writing).

**7. Architecture at a glance**

One paragraph naming the pieces: SQLite-backed message store, secret-stack RPC surface, WebSocket bridge for browser clients, git-over-HTTP plugin, Decent frontend. Then a link list:

- [`docs/overview.md`](docs/overview.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/api.md`](docs/api.md)
- [`docs/cli.md`](docs/cli.md)
- [`docs/frontend.md`](docs/frontend.md)
- [`docs/http-replication.md`](docs/http-replication.md)

**8. What changed from classic scuttlebot**
- Modern Node (≥ 22.5) and `node:sqlite` replace flume and native dependencies
- Message storage is SQLite-backed
- HTTP replication is available alongside classic muxrpc transport
- The `ssb-server` / `sbot` CLI and most classic commands are preserved

One short paragraph plus the bullets above. No dropped-plugin list.

**9. Contributing and license**
- One sentence pointing at [`AGENTS.md`](AGENTS.md) for development conventions.
- MIT license line.

### Screenshots

Capture and commit to `docs/img/`:

| File | What to show |
|---|---|
| `feed.png` | Decent feed with a few posts visible |
| `git-forge.png` | Git-forge tab with a branch list or commit log |
| `decent.png` | Compose or profile view |

Use the live instance if it has richer content and is appropriate for a public README. Keep each image under 500 KB.

### Editing rules

- Link into existing docs rather than re-explaining their content.
- Do not invent commands or features. Every command must already work.
- No CI badges, stars widgets, or contributor lists in this pass.
- Preserve the MIT license.

---

## Part 3: Docs alignment

Make `docs/*.md` describe current `ssbc` behavior accurately. The archived scuttlebot.io docs remain as reference material — do not rewrite them wholesale.

### 3a. Add archive framing at `/docs` entry points

Add a visible note near the `/docs` entry point clarifying:
- these are archived scuttlebot.io docs,
- they are useful reference,
- they may not exactly match the behavior of this repository,
- repo-specific behavior defers to local README, help output, and `docs/*.md`.

This is the highest-value, lowest-risk fix.

### 3b. Fix the most misleading doc-to-code drifts

**`version()`** — `lib/db.js` returns `'1.0.0'`, which is the SQLite plugin version, not a meaningful server version. Either document that `version` is implementation-defined in this repo, or change it to return something more meaningful (e.g. from `package.json`).

**`createFeedStream` range filters** — Current `lib/db.js` ignores `gt/gte/lt/lte`; only `limit` and `reverse` are applied. Fix the implementation to honor range filters, or document explicitly that they are unsupported.

**`latest` help text** — `lib/cli-help.js` says "every feed this server follows" but the implementation returns latest sequence for every author in the DB regardless of follow state. Fix the help text to match the implementation.

**Browser client wording** — Archived docs say the API client is Node.js only. This repo serves browser clients through Decent via `ssb-ws`. Add a repo-specific note clarifying the ws-enabled browser access.

**`query.read`** — Document explicitly that `sbot.query.read` returns empty results in this setup and should not be relied on.

### 3c. Tighten `docs/*.md` with concrete behavior

Expand existing pages with:
- Real command examples
- Practical API call examples with shapes
- Clear notes on what is actually supported
- Cross-links between overview, CLI, API, and frontend docs

### 3d. De-emphasize legacy surfaces

Do not center docs around:
- `query.read`
- `links2.read`
- Old indexing assumptions from historical implementations

If still present, mention briefly and only where necessary.

### 3e. Add docs maintenance guidance

Create `docs/docs-maintenance.md` explaining:
- `docs/*.md` are the primary source of truth for current behavior
- `docs/scuttlebot.io/` is archived reference material
- Vendored scuttlebot source lives in `vendor/scuttlebot.io/`
- Archived docs are regenerated with `npm run sync:scuttlebot-docs`

### 3f. Onboarding empty state (optional but recommended before README)

When the user's feed and follow graph are empty, show a "Welcome to Decent" panel in place of the blank feed with 2–3 concrete next steps:
1. Set a display name and avatar (link to profile editor)
2. Write a first post (link to compose)
3. Accept an invite code to join a network (short explanation + pointer to `decent.evbogue.com`)

If possible, expose invite-acceptance in the UI so newcomers do not have to drop to the CLI. Keep scope tight — a clean empty state plus a visible invite field is enough.

---

## Non-goals

- Rewriting the entire archived scuttlebot.io docs set
- Changing SSB server, sync, or git-over-HTTP behavior (unless fixing a `createFeedStream` range filter)
- Adding compatibility theater for features nobody uses
- Designing a project logo or favicon
- Marketing copy beyond the hero section

---

## Done when

- [ ] `docs/img/` exists and is tracked
- [ ] Live demo flow at `decent.evbogue.com` is confirmed and documented
- [ ] `README.md` follows the nine-section order above with all sections present
- [ ] Three screenshots in `docs/img/` render correctly in the README
- [ ] All README internal links resolve
- [ ] Every README command runs against the current repo without modification
- [ ] README credits Dominic Tarr and Paul Frazee explicitly and warmly
- [ ] Archive framing note is present at `/docs` entry point
- [ ] `version()` drift is resolved (code or docs)
- [ ] `createFeedStream` range filter drift is resolved (code or docs)
- [ ] `latest` CLI help text matches implementation
- [ ] `query.read` status is documented
- [ ] `docs/*.md` pages have real examples and cross-links
- [ ] `docs/docs-maintenance.md` exists
