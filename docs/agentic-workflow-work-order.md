# Work Order: Improve agentic workflow reliability

**Status:** Backlog — ready to split into small implementation chunks.
**Scope:** Agent/developer workflow tooling and docs for this repo. This does not change SSB protocol behavior, Decent UI behavior, or the public deployment routing that was already consolidated to `ssb.evbogue.com`.
**Type:** Workflow hardening. Net effect: turn repeated agent rituals into scripts, make handoffs cleaner, and reduce the chance of broken builds or half-finished pushes.
**Intent:** This repository is being developed by multiple AI agents plus a human maintainer. The current `AGENTS.md` captures the rules well, but many rules still rely on memory and manual sequencing. This work order converts the remaining suggestions from the September 3, 2026 session into concrete, testable repo improvements.

> **Context for whoever picks this up cold:** `ssbc` is a Node.js SSB server plus the Decent browser frontend. The agent workflow has a few non-obvious invariants: pull before work, keep local sbot running, build web changes with an output-size check, test before committing, commit every finished chunk, and push to both `origin` and the local git-over-SSB `ssb` remote. The app's `npm run build:web` can historically appear successful even when the generated bundle is empty, so workflow automation should be defensive.

## Already implemented in this session

Do not duplicate these as new work:

- `AGENTS.md` now says to start `node bin.js start` after pulling if sbot is not already running, and to leave it running unless Ev explicitly asks to stop it.
- Public SSB web hostnames now consolidate to `https://ssb.evbogue.com`; old SSB hostnames redirect there.
- Repo docs now use `ssb.evbogue.com` as the canonical public instance.

## 1. Add an agent preflight command

Create a script such as `scripts/agent-preflight.sh` and a matching npm alias, for example:

```bash
npm run agent:preflight
```

The script should:

- run `git pull --ff-only`;
- check whether `127.0.0.1:8989` is listening;
- start `node bin.js start` in a durable local session if sbot is not running;
- print `git status --short`;
- print both remotes from `git remote -v`;
- warn if the `ssb` remote is missing or is still using the legacy `ssb://` scheme;
- optionally print the latest local and remote `main` commits.

Acceptance criteria:

- A new agent can run one command at session start and see the repo, remotes, dirty state, and sbot status.
- Running the command twice is safe and does not start duplicate sbot processes.
- `AGENTS.md` points agents to this command as the first step of normal work.

## 2. Add a web-change verification command

Create `scripts/verify-web-change.sh` and an npm alias such as:

```bash
npm run verify:web -- decent-profile-qr
```

The command should:

- run `npm run build:web`;
- fail if `decent/build/index.html` is suspiciously small, especially around the known broken-build size of ~1 KB;
- accept an optional string argument and grep `decent/build/index.html` for that string;
- print the final bundle size;
- optionally curl the running local app at `http://127.0.0.1:8989/` when sbot is running.

Acceptance criteria:

- A broken browserify bundle makes the command exit non-zero.
- A missing expected string makes the command exit non-zero.
- The script explains failures in human-readable language instead of leaving agents to infer from raw shell output.
- `AGENTS.md` and `README.md` mention this command anywhere they currently describe the manual build-size check.

## 3. Add a finish-chunk command

Create `scripts/finish-chunk.sh` as a guarded helper for the final commit/push sequence.

The script should not replace judgment, but it should make the common path boring:

- show `git status --short`;
- require an explicit commit message argument;
- optionally accept a test command argument, defaulting to `npm test`;
- run the chosen verification command;
- stage only paths passed explicitly, or refuse to auto-stage by default;
- create the commit with the required co-author trailer;
- verify `main` can fast-forward before pushing to `origin`;
- push `HEAD:main` to `origin` and `ssb`;
- surface any `ssb` push failure clearly.

Acceptance criteria:

- The script refuses to commit when there are unstaged tracked changes outside the requested path list.
- The script refuses to push if `origin/main` is not an ancestor of `HEAD`.
- The script does not touch unrelated untracked screenshots, work orders, or generated artifacts.
- The script leaves a clear transcript of what was tested and where the commit was pushed.

## 4. Add an agent handoff template

Create `docs/agent-handoff-template.md` with fields that work for both context compaction and cross-model review:

```markdown
# Agent Handoff

## Current goal

## Branch and commits

## Files touched

## Tests and verification

## Running processes

## Remote/deployment state

## Intentional untracked files

## Open risks

## Next exact command
```

Acceptance criteria:

- `AGENTS.md` links to the template in the cross-model review or agent working notes section.
- The template reminds agents to mention intentionally untracked files.
- The template includes room for remote state, because this repo often spans local git, git-over-SSB, and `/root/ssbc` on the public server.

## 5. Add first-class deployment docs

Create `docs/deployment.md` and link it from `README.md`'s docs list.

The doc should cover:

- local development versus the public server;
- `/root/ssbc` as the app checkout on `root@evbogue.com`;
- `/root/reverse-proxy` as the Deno reverse proxy checkout;
- `reverse-proxy.service`;
- the tmux-run sbot process and expected listeners;
- canonical hostname policy: `ssb.evbogue.com` is canonical, old SSB web hostnames redirect there;
- certificate/SAN maintenance for non-SSB hostnames;
- deploy sequence: pull, install dependencies, build, check bundle size, restart sbot, curl canonical URL and redirects;
- rollback notes.

Acceptance criteria:

- Future agents do not need to rediscover the reverse proxy layout by SSH inspection.
- The doc distinguishes repo deployment from reverse-proxy deployment.
- The doc includes concrete verification commands and expected healthy signs.

## 6. Add a minimization backlog

Create `docs/minimization.md` or convert an existing untracked work order into a tracked, current backlog.

Include candidates from this session:

- legacy public skin hostnames: done by redirecting them to `ssb.evbogue.com`;
- legacy `style.css`: decide whether it remains a historical archive surface or becomes removable;
- per-skin UI plugin aliases: keep for local/PWA default-skin compatibility for now, but reassess once one-app skin switching is mature;
- duplicate CSS patterns across skins: continue reducing into `base.css`;
- outdated docs wording around multiple public apps: mostly fixed, but keep scanning docs and README snippets;
- untracked skin audit screenshots: decide whether to archive under `docs/img/`, ignore, or remove.

Acceptance criteria:

- The backlog separates things already removed from things still under consideration.
- Each removal candidate names the risk of removing it.
- Each item has a clear "keep", "remove", or "defer" decision point.

## 7. Optional: make local sbot a launchd service

If keeping sbot running manually continues to be fragile, add a macOS `launchd` option for Ev's local machine.

This should probably be opt-in documentation plus a template plist, not an automatically installed service.

Acceptance criteria:

- A documented command installs or loads the service only when Ev chooses to do so.
- The service runs `node bin.js start` from `/Users/evbogue/Code/ssbc`.
- Logs are easy to find.
- The normal script-based preflight still works even without launchd.

## Suggested implementation order

1. `agent-preflight`
2. `verify-web-change`
3. `agent-handoff-template`
4. `deployment.md`
5. `finish-chunk`
6. `minimization.md`
7. optional launchd service

This order front-loads the workflow guardrails agents need every session, then captures the larger operational knowledge.

## Verification

For each workflow chunk:

```bash
npm test
git diff --check
```

For scripts, also test the happy path and at least one intentional failure path. For docs-only chunks, `node test/docs.js` is enough when the served docs renderer or docs allowlist changes; otherwise `git diff --check` plus a careful read is acceptable.
