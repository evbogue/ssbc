# Work Orders

This is the triage index for proposal and implementation notes in `docs/*-work-order.md`.
Work orders are not current-behavior documentation; they are backlog material, design
records, or historical implementation notes. When a work order lands, move the stable
behavior into the canonical docs and mark the order as implemented or superseded here.

## Project Fit

The highest-fit work advances the repo's thesis: a modern continuation of classic SSB
with signed feeds, replication, blobs, invites, local ownership, familiar sbot workflows,
Decent as the browser client, and git-over-SSB as a real capability.

Use this priority ladder:

1. Keep the local node and public node reliable.
2. Reduce forks and skin-specific behavior so Decent is one coherent app.
3. Strengthen SSB-native capabilities, especially replication, identity, private messages,
   blobs, and git-over-SSB.
4. Polish skins when the polish rides on shared components and does not create a separate
   product fork.
5. Defer novelty that adds new schemas, new social abstractions, or product claims before
   the current primitives are solid.

## High Priority

### Agent workflow reliability

File: `docs/agentic-workflow-work-order.md`

This is the first thing to do because it protects every later change. The repo has a few
non-obvious invariants: pull first, keep sbot running, build the web bundle defensively,
test before committing, and push to both `origin` and `ssb`. Converting those rituals into
scripts directly reduces broken deploys, stale bundles, and half-finished agent handoffs.

Best first slices:

- `npm run agent:preflight`
- `npm run verify:web`
- `docs/agent-handoff-template.md`

### Mobile audit deploy safety

File: `docs/mobile-audit-work-order.md`

`build:web` safety is complete: a failed bundle build cannot replace the served
`decent/build/index.html`. The next workflow slice is `npm run verify:web`, which should
confirm a specific expected string is present in the successful bundle before a frontend
change is declared done.

Keep the naming cleanup (`isSsbproSkin` meaning network skin, hidden inline compose DOM)
as a near-term cleanup because it removes traps that caused real cross-skin defects.

### Skin unification

File: `docs/skin-unification-work-order.md`

This is the main product architecture direction: one Decent app, three CSS skins, one
SSB-default vocabulary, live theme switching, and fewer JS branches. It fits the project
better than maintaining separate branded app variants because the underlying model is one
local SSB node and one browser client.

Do it after the workflow/build guardrails are in place. Phase 0, the shared skin accessor,
is the best first slice.

## Medium Priority

### Git author identity via SSB self-claim

File: `docs/git-identity-work-order.md`

This strongly fits the git-over-SSB thesis, but it defines a public message schema. Keep it
behind design review/sign-off before publishing real messages. The right near-term action
is review and schema validation, not implementation.

### Chat / DM redesign

File: `docs/chat-redesign-work-order.md`

The bugs are real: sent/received DMs depending on reload, feed-card rendering inside chat,
and reply navigation leaving the private context. Fixing private messages fits classic SSB.
The product-specific "Bluesky-style" framing should now be re-scoped through the skin
unification direction: build one shared Private experience, then let skins style it.

### SQLite replication follow-ups

File: `docs/sqlite-replication-work-order.md`

The core replication gap is already closed by `test/replication.js`. The remaining items
are worthwhile but not urgent unless a live-stream caller bug surfaces. The highest-value
follow-up is auditing `createHistoryStream({ live: true })` / `createUserStream({ live })`
callers because it may explain UI freshness issues.

## Low Priority

### decent2 evolution polish

File: `docs/decent2-evolution-work-order.md`

The first cut is implemented. Remaining gloss passes are nice, but they should wait until
the one-app skin model is stable. Polish should live in `decent2-style.css` and shared
component CSS, not in new skin-conditional DOM.

### ssbpro professional-network leftovers

Files:

- `docs/ssbpro-professional-network-work-order.md`
- `docs/ssbpro-remaining-work-order.md`

These are mostly historical design records now. The implemented pieces are useful, especially
Connect/QR and bio-aware cards, but future work should be folded into shared Decent features
where possible. Avoid adding structured resume fields or new professional-network message
types; that drifts away from classic SSB primitives.

### Skin architecture refactor

File: `docs/skin-architecture-refactor-work-order.md`

This has been overtaken by the current `base.css` and skin-unification work. Keep it as
historical context for why `base.css` exists, but do not implement it as written.

## Cleanup Rules

- Mark landed work orders as implemented or superseded at the top of the file.
- Keep old implementation detail only when it explains a real constraint or gotcha.
- Move current behavior into `README.md`, `docs/frontend.md`, `docs/architecture.md`,
  `docs/api.md`, or generated API docs after the feature lands.
- Delete or archive scratch screenshots once the work order that produced them is complete.
- Avoid new work orders for skin-specific product forks. Prefer shared Decent behavior plus
  CSS skin identity.
