# Work Order: Overhaul the README

**Status:** Ready once the remaining prep choice is made
**Depends on:** `readme-prep-work-order.md` (run that first)
**Intent:** Replace the current terse technical README with one that pays respect to the origins of Secure Scuttlebutt, gets newcomers excited, and clearly shows how to use `ssbc` with the Decent client — including the git-ssb story.

## Status note

Prep work was narrowed after review.

Already done:
- repo identity and command-surface cleanup
- project thesis/tone direction clarified
- several Decent/git-forge correctness fixes that affected trustworthiness

Not being done as prep:
- no `docs/` reorganization
- no broad docs rewrite before the README

Remaining choice before execution:
- either do the first-run onboarding/empty-state product work first,
- or proceed directly with the README overhaul and describe the current first-run experience honestly.

## Audience

Primary: a developer who has never run an SSB node and has maybe heard of the protocol in passing. They should finish the README understanding what the project is, why it exists, and how to try it without being asked to buy into bigger claims than the software can support.

Secondary: a returning SSB user who wants to know what changed and whether their classic workflow still works.

Both readers should feel welcome.

## Context for the writer

- The project is `ssbc` — Secure-Scuttlebot Classic. It is a modernized local implementation of the classic `ssb-server` / `scuttlebot` behavior, backed by `node:sqlite` and served with a built-in web UI called Decent.
- A live instance runs at `https://ssb.evbogue.com/`. Confirm what a first-time visitor sees there (see the prep work order) and describe the experience honestly in the README.
- `ssbc` exists to preserve the useful classic SSB behavior on a modern Node stack.
- The git-over-SSB feature is the most distinctive thing in the repo. It should get its own section, not a bullet point.
- Original credit belongs to Dominic Tarr (SSB protocol, scuttlebot) and Paul Frazee (Patchwork and the classic client ecosystem). The README should acknowledge them directly and with warmth.
- Stronger ecosystem or social-web claims belong in Everett Bogue's own posts and comments, not in the README.

## Tone guidance

- Welcoming, not breathless. Excitement should come from the ideas, not from adjectives.
- No emojis anywhere.
- No marketing filler. Every sentence should either teach, orient, or invite action.
- Plain language over jargon. Explain SSB terms (feed, blob, pub, invite) the first time they appear.
- Short sentences. Short paragraphs. Code blocks when showing commands.
- Keep claims grounded in the repo's current behavior and scope.
- Do not turn the README into manifesto copy or a claim that this project "solves social media."

## Sections (in order)

### 1. Hero

- A one-line tagline describing what this is in human terms.
- Two or three sentences explaining what SSB is: an append-only log of signed messages, gossiped between peers, stored on each user's own computer. No central server, no algorithmic feed.
- A call-to-action link to `https://ssb.evbogue.com/` inviting the reader to see a live node in the browser before installing anything. Describe what they will see there based on the prep-work findings.
- One screenshot of the Decent feed view. Place the image in `docs/img/` and reference it with a relative path.

### 2. Why ssbc exists

- Credit Dominic Tarr for creating Secure Scuttlebutt and the original `scuttlebot`.
- Credit Paul Frazee for Patchwork and the ecosystem work that shaped how classic SSB clients looked and felt.
- State plainly: SSB was abandoned in 2024 and classic clients stopped working on modern Node.
- State ssbc's mission in one or two sentences: restore classic behavior on a modern stack so the network keeps working. A preservation project, not a re-imagining.

### 3. What you can do

Feature tour as a short list, each item a verb-first sentence:

- Post and read a social feed that lives on your own computer
- Follow people and build a social graph that syncs offline
- Send end-to-end encrypted private messages
- Share files through the peer network as blobs
- Host git repositories on your own node (see below)
- Join networks via invite codes from a pub

No emojis. Two-to-six words per bullet where possible.

### 4. Git over SSB (spotlight section)

This is the section that should make developers stop scrolling.

- Frame it: a decentralized git host. Your repositories live in your SSB log. Anyone who follows you can clone them. No GitHub, no GitLab, no server admin.
- Walk through the real commands, already documented in the current README:
  1. Create a repo: `node bin.js git.create my-project` returns a URL.
  2. Add it as a remote and push: `git remote add ssb <url>` then `git push ssb main`.
  3. A peer on another node clones the same URL and receives the objects via blob replication.
- Mention Decent's git-forge UI briefly: it lets you browse repos, branches, and commits in the browser.
- Include a screenshot of the git-forge tab in Decent.

### 5. Quick start

Minimal, opinionated, three-command path:

- Requirements: Node ≥ 22.5, git, npm
- Install: `npm install`
- Run: `npm start`
- Open the local Decent URL printed by the server at startup. With current defaults this is usually `http://127.0.0.1:8989/`.

Then one short paragraph on joining the network: accept an invite code with `node bin.js invite.accept "<code>"`. Mention that `ssb.evbogue.com` is one public node people can request an invite from; avoid hard-coding an invite that will expire.

Push detailed CLI usage to `docs/cli.md` rather than expanding this section.

### 6. Using Decent

- What it is: the built-in browser client, served by `plugins/decent-ui.js`.
- Where it lives in the repo: `decent/`.
- How to rebuild: `npm run build:web`.
- One screenshot of the compose view or the profile view.
- One short paragraph noting what newcomers will see on first launch, based on the actual state of the onboarding work when the README is written.

### 7. Architecture at a glance

One paragraph naming the pieces: a SQLite-backed message store, a secret-stack RPC surface, a WebSocket bridge for browser clients, a git-over-HTTP plugin, and the Decent frontend. Then a link list into the existing docs:

- [`docs/overview.md`](docs/overview.md) — what the pieces are
- [`docs/architecture.md`](docs/architecture.md) — how they fit together
- [`docs/api.md`](docs/api.md) — RPC surface and shapes
- [`docs/cli.md`](docs/cli.md) — command reference
- [`docs/frontend.md`](docs/frontend.md) — Decent internals
- [`docs/http-replication.md`](docs/http-replication.md) — replication protocol

### 8. What changed from classic scuttlebot

Keep high-level — the audience is mostly newcomers who never used classic:

- Modern Node (≥ 22.5) and `node:sqlite` replace the flume index and native dependencies
- Message storage is SQLite-backed
- HTTP replication is available alongside the classic muxrpc transport
- The `ssb-server` / `sbot` CLI and most classic commands are preserved

No specific dropped-plugin list. One short paragraph plus the bullets above.

### 9. Contributing and license

- One sentence pointing at [`AGENTS.md`](AGENTS.md) for development conventions.
- MIT license line.

## Screenshots

Capture three screenshots and commit them to `docs/img/`:

1. `feed.png` — Decent feed view, used in the hero section. Prefer a feed with a few posts visible so it does not look empty.
2. `git-forge.png` — the git-forge tab showing a repo browser, ideally with a branch list or commit log visible.
3. `decent.png` — either the compose view or the profile view, whichever better conveys "this is a real client."

Use the live instance at `ssb.evbogue.com` if it shows a richer feed than a fresh local node, but only if the content there is appropriate for a public README. Otherwise capture against a local node.

Keep images reasonably sized (under ~500 KB each). PNG is fine.

## Editing rules

- Link into existing docs rather than re-explaining their content.
- Do not invent commands or features. Every command in the README must already work.
- When describing the live demo flow, use the observations recorded during the prep work order — do not guess.
- Do not add CI badges, stars widgets, or contributor lists in this pass.
- Preserve the MIT license.

## Out of scope

- Rewriting `docs/*.md` content (covered by `docs-alignment-work-order.md`).
- Changing any server or client behavior.
- Designing a project logo or favicon.
- Marketing copy beyond what fits in the hero section.

## Done when

- `README.md` follows the section order above, with every section present.
- Three screenshots live in `docs/img/` and render correctly in the README.
- All internal links resolve and point at the right files.
- Every command in the README runs against the current repo without modification.
- The README credits Dominic Tarr and Paul Frazee explicitly and warmly.
- A first-time reader can get from "never heard of SSB" to "running a local node and viewing Decent" using only the README.
