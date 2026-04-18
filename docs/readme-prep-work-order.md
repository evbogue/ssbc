# Work Order: Pre-README cleanup

**Status:** In progress
**Intent:** Prepare the repo for a README overhaul so the new README lands on a coherent, welcoming codebase. Runs before `readme-overhaul-work-order.md`.

## Status note

This work order was narrowed after review. We are only treating real documentation blockers as prep work.

Completed:
- Project thesis and docs tone were tightened in `README.md` and `AGENTS.md`.
- `package.json` metadata now identifies the project as `ssbc` and points at `evbogue/ssbc`.
- Command examples were normalized around `npm start` and `node bin.js ...`.
- The git-forge repo route decoding bug was fixed.
- Decent connection-status logging and the connected/disconnected indicator were fixed.
- Duplicate starts against the same app dir are now blocked so a second process cannot disturb blob temp state.

Dropped:
- Reorganizing `docs/` into `docs/work-orders/`.
  Reason: low value, unnecessary churn, and not a real prerequisite for better docs.

Still open:
- Create `docs/img/` for README screenshots.
- Decide whether to do the first-run onboarding/empty-state polish before the README overhaul.
- Confirm the live demo flow at `ssb.evbogue.com` before writing the README call-to-action copy.

## Goal

Fix repo-level inconsistencies and onboarding gaps that would make the new README feel off, so the README work can focus on content rather than apologizing for the surrounding state.

## Tasks

### 1. Update `package.json` metadata

Status: done.

Previous state: `name`, `homepage`, and `repository.url` pointed at upstream `ssbc/ssb-server`.

Change to reflect this fork:
- `name`: `ssbc` (or `secure-scuttlebot-classic` — pick one and be consistent)
- `description`: something that matches "Secure-Scuttlebot Classic — a modernized SSB server with a built-in web UI and git-over-SSB"
- `homepage`: `https://github.com/evbogue/ssbc`
- `repository.url`: `git+https://github.com/evbogue/ssbc.git`
- Keep the existing `bin` entries (`sbot`, `ssb-server`) — those are CLI names, not package identity.

### 2. Create a screenshots directory

Status: not started.

Make `docs/img/` with a `.gitkeep`.
Screenshots referenced by the new README will live here. No images need to be captured in this work order — that happens during the README overhaul.

### 3. Reorganize `docs/` so user-facing docs are clean

Status: dropped.

Decision:
- Do not reorganize `docs/`.
- Keep the work-order files where they are.

Reason:
- This is not a meaningful prerequisite for truthful or useful docs.
- It adds churn and link updates without improving the actual README overhaul.

### 4. Polish onboarding for self-hosted Decent

Status: not started.

This remains the one meaningful optional product task before the README overhaul.

Onboarding on a fresh local `npm start` should feel welcoming, not like landing in a broken app. The exact first-run behavior should be checked against the current local Decent experience before implementing this.

Improve the empty-state experience:
- When the user's feed and follow-graph are empty, show a "Welcome to Decent" panel in place of the blank feed. It should briefly explain what they are looking at and give them 2–3 concrete next steps:
  1. Set a display name and avatar (link to profile editor)
  2. Write their first post (link to compose)
  3. Accept an invite code to join a network (with a short explanation of what an invite is and a pointer to `ssb.evbogue.com` as one public option)
- If possible, also expose invite-acceptance in the UI so newcomers don't have to drop to the CLI.

Keep this section scoped — a clean empty state plus a visible invite field is enough. Do not redesign the whole onboarding flow.

Note:
- Treat this as product work, not docs housekeeping.
- README work can proceed without it if we choose to document the current behavior honestly.

### 5. Confirm the live demo flow at `ssb.evbogue.com`

Status: not started.

The new README will point first-time readers at `https://ssb.evbogue.com/`. Before that link ships, walk through the flow in a private window and note what a visitor actually sees. Record the answer in a short note at the top of the README work order so the next agent can describe the experience honestly:
- Does it land on a usable Decent feed, or a login/invite wall?
- Is there a shareable invite code we want in the README?
- Is there a public follow the demo node publishes to, so new visitors see activity?

If changes are needed on the hosted instance to make the landing welcoming (e.g., a shared read-only view, a visible invite), note them here and either fix or document as a follow-up.

## Out of scope

- Writing the README (handled by the README overhaul work order)
- Capturing screenshots (handled by the README overhaul work order)
- Broader docs rewrites (see `docs-alignment-work-order.md`)
- Any functional changes to the SSB server, sync, or git-over-HTTP

## Done when

- `package.json` identifies this project as ssbc and links to the correct repo
- `docs/img/` exists and is tracked
- A newcomer opening Decent on a fresh node sees a welcoming empty state with clear next steps
- The live-demo flow at `ssb.evbogue.com` is documented or improved so the README can honestly invite readers to try it

## Current recommendation

The remaining choice before the README overhaul is:
- either do the onboarding/empty-state improvement first,
- or proceed directly to the README and document the current first-run experience honestly.
