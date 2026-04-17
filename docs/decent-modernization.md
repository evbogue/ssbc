# Work Order: Decent Frontend Modernization

**Status:** In progress
**Owner:** Whoever picks this up next
**Scope:** `decent/` only.  Server code (`bin.js`, `plugins/`, `lib/`, `test/`) is out of scope.
**Prerequisites:** Familiarity with `AGENTS.md` at repo root.  Read it first.

---

## Context

`decent/` is a browser-based Secure Scuttlebutt client that lives inside the `ssbc/` repo.
It was forked from Patchbay (a 10-year-old SSB client) and has been evolving since.  The
server (`bin.js` + `plugins/`) runs an SSB node and serves the Decent frontend bundle at
`http://127.0.0.1:8888/`.

Recent work has transformed Decent into a git-forge-capable SSB client — it renders git
pushes in the feed, browses repos, shows commit logs, and exposes a universal search.  The
navbar was recently simplified (avatar on the far left, compact search on the right,
connection status far right).

### Core design constraints (non-negotiable)

These shaped the original project and still shape it.  Do not regress them:

1. **Lite client.** The built artifact is a single `decent/build/index.html` with inlined JS
   and CSS.  You can host it anywhere — a static file server, an SSB pub, a laptop.
   Bundle size matters.  No React, no Vue, no framework that balloons the download.
2. **Self-hostable.** A user can run their own SSB pub + their own Decent instance.
   The bundle talks to the local sbot via WebSocket.  Don't introduce build steps or
   runtime dependencies that make self-hosting harder.
3. **Plugin architecture preserved.** Decent uses a small dependency-injection pattern
   (`needs` / `gives` / `create(api)` on every module) so that an agent or a human can
   write their own SSB client by composing the same modules differently.  This pattern is
   load-bearing.  It can be reimplemented, but not deleted.
4. **Readable source.** The bar is: a mid-level developer (or a capable LLM) can open the
   repo cold and trace any feature end-to-end in one session.  Optimize for legibility,
   not cleverness.
5. **pull-streams stay.** SSB speaks pull-streams natively.  Replacing them is a separate
   multi-month project and not in this work order.

### Current state of `decent/`

- **Its own `package.json`** with `"name": "patchbay", "version": "6.1.3"`.  The name
  is a fossil — Decent is not Patchbay, but the metadata was never updated.
- **Its own `node_modules/`, `package-lock.json`, AND `yarn.lock`** (two lockfiles —
  this alone is a bug).
- **~30 frontend files at `decent/` root**, not in a `src/` subdirectory.
- **Four module buckets**: `modules_core/`, `modules_basic/`, `modules_extra/`,
  `modules_embedded/`.  The split is historic, not principled.
- **CommonJS (`require`, `module.exports`), `var`, callback-style, `hyperscript` for DOM,
  pull-streams for async data.**
- **Build tooling**: `browserify` → `indexhtmlify` → custom `postprocess-index.js`.
  Entry point is `decent/index.js`; output is `decent/build/index.html`.
- **depject** is the plugin runtime.  It scans the three/four module index files,
  collects each module's `{ needs, gives, create }`, and wires them at startup.  See
  `decent/plugs.js` for the `first` / `map` / `asyncConcat` combinators.

### What "modernize" means here

**Modernize = legibility**, not "use the fashionable framework."  Specifically:

- ES modules, explicit imports, `const`/`let`.
- One `package.json` and one `node_modules/` at the repo root.
- A tidy `decent/src/` tree instead of 30 files at `decent/` root.
- A single build tool (esbuild) instead of a pipeline of three.
- Optionally: web components or `htm` tagged templates instead of hyperscript.  **Deferred
  to Phase 4 — may never happen.**

---

## Repo Working Agreement (read this, it's real)

This is how Ev (the human owner) runs development in this repo.  These are not
suggestions.  Follow them every session.

1. **Always `git pull` before starting.**  Ev pushes between sessions; the tree moves.
2. **Work in discrete, shippable chunks.**  A chunk = one coherent change that leaves the
   branch in a working state.
3. **Build after every change.**  `npm run build:web` for frontend edits.  A broken build
   is never an acceptable stopping point.
4. **Test before committing.**  `npm test` must pass with 0 failures.
5. **Commit every chunk.**  Never leave modified files in the working tree at task end.
6. **Push to BOTH remotes after every commit.**  The repo has two:
   - `origin` → GitHub
   - `ssb` → git-ssb (dogfooding; the Decent app surfaces pushes in the feed)

   ```bash
   PATH="$PATH:$(pwd)/node_modules/.bin" git push origin HEAD && \
   PATH="$PATH:$(pwd)/node_modules/.bin" git push ssb HEAD
   ```

   If `ssb` push fails, SURFACE THE ERROR.  Do not silently skip.
7. **Commit messages**: short imperative summary, optional body explaining *why*, and a
   co-author trailer when an AI wrote the change:
   ```
   Co-Authored-By: <model name> <noreply@anthropic.com>
   ```
8. **Never `--force` push.** Never force push to `main`.
9. **When Ev says "go" with no open questions, execute.**  Don't re-ask for confirmation
   on things already agreed.

### Commands you will use often

```bash
node bin.js start            # start sbot + HTTP UI on :8888
npm run build:web            # rebuild decent/build/ (runs from repo root)
npm test                     # run server test suite
```

### Style rules

- **Server-side** (`plugins/`, `lib/`, `test/`): modern JS — `const`/`let`, arrow
  functions, template literals.  Keep this unchanged; it's already modernized.
- **Decent frontend** (`decent/`): currently old-style — `var`, named functions, string
  concat.  **This work order's job is to modernize these files.**  Until a given module
  is converted, match its existing style.
- 2 spaces, no tabs.  Single quotes.  Omit semicolons.  Match the existing file's
  conventions when in doubt.

### Landmines (real bugs that ate real sessions)

- **Never `decodeURIComponent` a raw SSB message key.**  Keys start with `%` + base64.
  base64 characters after `%` frequently form valid percent-encoded sequences, so
  `decodeURIComponent` silently mangles ~12% of real keys.  Compare keys as raw strings.
- **Blob uploads must be sent as binary**, not base64 strings.  `POST /blobs/add`
  expects the raw bytes; decode the data URL with `atob` + `Uint8Array` before sending.
  The `dataurl-` package sends a base64 string — wrong.  Pattern in `AGENTS.md`.
- **`sbot_query` (flumeview-query) returns empty results in this setup.**  The index
  is not built.  Use `sbot_messagesByType` or `sbot_links` instead.
- **`message_meta` and `message_action` are `'map'` plugs** — multiple modules contribute.
  Do not assume one implementation owns the output.
- **`vote.reason`** is the correct spec field for emoji reactions.  Always *write*
  `reason`; always *read* `reason || expression` (legacy compat).
- **`window.CACHE`** is in-memory message store.  Read-only from UI modules.

### What NOT to change (this work order)

- Server code.  `bin.js`, `plugins/decent-ui.js`, `plugins/git-server.js`, `lib/`, `test/`.
- The `{ needs, gives, create }` plugin shape.  You may reimplement the wiring but keep
  the interface.
- pull-streams.  Callback-style SSB APIs may be wrapped in Promises, but do not replace
  pull-streams wholesale.
- The single-file HTML build output.  `decent/build/index.html` must remain the
  deployable artifact, with inlined JS and CSS, after Phase 3.
- The git-ssb protocol server (`plugins/git-server.js`).
- Any file under `lib/vendor/`.

---

## Phases

Each phase is independently shippable.  Do not start Phase N+1 until Phase N is
committed, pushed to both remotes, and has a green `npm test` + a clean
`npm run build:web`.

**After each phase, update this work order**: set the phase's status to "Done" and
add a one-line note of anything that differed from the plan.

---

### Phase 1 — Structural cleanup

**Goal:** one package, one lockfile, one `decent/src/` tree.  No behavior change.

**Status:** Done
**Notes:**
- `modules_embedded/` was removed instead of moved because it only referenced a
  missing `patchbay/` checkout.
- `manifest.json` was kept and moved into `src/` because `src/modules/core/sbot.js`
  loads it at connect time (muxrpc manifest for the sbot RPC surface).
- Follow-up cleanup: deleted three dead Patchbay-era scripts (`scripts/build.js`,
  `dir.js`, `create-index.js` — all `require`d a non-existent `patchbay/public`);
  deleted unused `src/modules/core/_screen_view.js` and the commented-out reference
  in `core/index.js`; rewrote `decent/README.md` to reflect the new layout; fixed
  stale `cd decent && npm run lite` references in AGENTS.md and top-level README.

#### Step 1.1 — Audit `decent/` dependencies

Produce a list of npm packages that are actually `require`d in `decent/` source.  Compare
against `decent/package.json` `dependencies`.  Everything in `dependencies` that is not
`require`d anywhere in `decent/**/*.js` is a candidate for removal.

Command to produce the actually-used list:

```bash
grep -rh "require(" decent/modules_*/*.js decent/*.js \
  | grep -oE "require\(['\"][^./][^'\"]*['\"]" \
  | sort -u
```

Known-suspicious (may be unused, verify):
- `peaks.js`, `moment`, `open-external`, `pull-reconnect`, `pull-scroll`, `pull-many`,
  `ssb-ws` (the server uses this, not the frontend), `ssb-feed`, `browselectrify`
  (devDependencies; `lite` script doesn't use it).

**Deliverable:** a list of deps to remove, attached to the Phase 1 commit message.

#### Step 1.2 — Merge `decent/package.json` into root `package.json`

- Copy `decent/package.json` `dependencies` and `devDependencies` that are *actually
  used* into the root `package.json` under the existing sections (merge, don't duplicate).
- Resolve version conflicts by taking the higher version; flag any real conflicts.
- Move the `lite` script from `decent/package.json` into root `package.json` as
  `build:web` (it already mostly is; confirm the command works from the root cwd).
- Delete `decent/package.json`, `decent/package-lock.json`, `decent/yarn.lock`,
  `decent/node_modules/`.
- Run `npm install` at the root.  Run `npm run build:web`.  Confirm output.
- Run `npm test`.  Confirm 0 failures.

**Gotcha:** some `decent/scripts/*.js` files may `require('something')` expecting
`decent/node_modules/`.  Paths resolve up the tree, so this should Just Work from root
`node_modules/`, but verify.

**Commit message:** `decent: merge package.json into root, drop duplicate lockfile`

#### Step 1.3 — Delete dead files

Files that appear obsolete — verify each before deleting:

- `decent/graph.svg` — generated visualization, not used at runtime.
- `decent/screenshot-*.png` — docs artifact, not needed in the tree.
- `decent/electron-shim.js` — Patchbay had an Electron build; Decent does not.
  (Confirm by `grep -r electron-shim decent/` — if only `package.json`'s `browser` field
  references it, the file is dead.)
- `decent/manifest.json` — historic Patchbay manifest; check if anything reads it.
- `decent/basic.js`, `decent/embedded.js` — top-level aggregators; check which one
  `decent/index.js` actually uses and what, if anything, loads the other.

**For each file:** `grep -r <filename-without-ext> decent/ plugins/ lib/ bin.js` to confirm
no references before deleting.

**Commit message:** `decent: remove dead Patchbay-era files`

#### Step 1.4 — Create `decent/src/` and move files in

Target layout:

```
decent/
├── src/
│   ├── main.js                 # was decent/index.js
│   ├── wire.js                 # was decent/plugs.js (or keep name; see Phase 2)
│   ├── config.js
│   ├── keys.js
│   ├── util.js
│   ├── scroller.js
│   ├── keyscroll.js
│   ├── highlight.js
│   ├── style.css
│   ├── style.css.json          # generated, see decent/scripts/style.js
│   └── modules/
│       ├── core/               # was modules_core/
│       ├── ui/                 # was modules_basic/
│       ├── git/                # git-*.js from modules_extra/
│       ├── extras/             # rest of modules_extra/
│       └── embedded/           # was modules_embedded/
├── build/                      # unchanged; generated
├── scripts/                    # unchanged (style.js, postprocess-index.js)
├── README.md
└── LICENSE
```

After each move, update:
- `require('./X')` paths inside every moved file to the new relative paths.
- `decent/scripts/style.js` — it reads `decent/style.css`; update to `decent/src/style.css`.
- `decent/scripts/postprocess-index.js` — check for hardcoded paths.
- Root `package.json` `build:web` script — the browserify entry is currently
  `decent/index.js`, update to `decent/src/main.js`.

**Important**: do the directory renames and the `require()` updates as ONE atomic commit
per bucket (e.g. one commit for `modules_core/` → `src/modules/core/`).  Do not split the
rename from the import-update — the tree is broken in between.

**Order of work** (smallest dependency surface first):
1. Move top-level aggregator files (`index.js` → `src/main.js`, `plugs.js` → `src/wire.js`,
   `keys.js`, `util.js`, `scroller.js`, `keyscroll.js`, `highlight.js`, `config.js`).
2. Move `modules_core/` → `src/modules/core/`.
3. Move `modules_basic/` → `src/modules/ui/`.
4. Split `modules_extra/`:
   - `git-*.js` → `src/modules/git/`
   - Everything else → `src/modules/extras/`
5. Move `modules_embedded/` → `src/modules/embedded/`.

After each move: `npm run build:web` must succeed; `npm test` must pass.  Commit + push.

**Deliverable:** `ls decent/` fits on one screen; `decent/src/` has a clear hierarchy;
build and tests pass.

---

### Phase 2 — ESM + explicit wiring

**Goal:** convert `decent/src/**/*.js` from CommonJS to ES modules.  Replace depject's
directory-scan wiring with an explicit import graph in `wire.js`.  `var` → `const`/`let`.

**Status:** Not started

**Start only after Phase 1 is merged.**

#### Decision to make before starting

Keep depject or replace it?  Two options:

- **Option A: Keep depject, convert to ESM.**  depject is ~200 lines and works.  The
  directory-scan magic (`require('./modules_core')` returns an array of all module files)
  is what's obscure — replace that with an explicit array of imports.  depject itself just
  resolves `needs` against `gives`.  Low risk.
- **Option B: Replace depject with a ~40-line hand-rolled resolver.**  The only thing
  depject does that matters is:
  1. Collect each module's `gives` into a map.
  2. For each module's `needs`, look up the `gives` and pass them as `api` to `create()`.
  3. Handle `'first'` (first truthy result wins) and `'map'` (collect all results).

  A small replacement makes the whole system legible in one file.  Slightly higher risk.

**Recommendation: Option B.**  Decent's plugin system is a teaching example; making it
self-contained makes the "an agent can write their own SSB client" story real.

**Ask Ev to pick before starting.**

#### Conversion protocol (per module)

One file at a time.  For each file:

1. `var x = require('y')` → `import x from 'y'` (package) or `import x from './y.js'`
   (local; note the `.js` extension, required in native ESM).
2. `module.exports = { ... }` → `export default { ... }` or named exports.
3. `var` → `const` (or `let` if reassigned).  Arrow functions are fine.
4. Do NOT rewrite callback-style SSB API calls.  That's a separate phase.  The goal is
   mechanical conversion, not rewriting logic.
5. Re-run `npm run build:web` after each file.  If the build breaks, the error tells you
   the next file to fix.

**Commit rhythm:** one commit per ~5-10 files, grouped by module bucket (core, ui, git, etc.).
Each commit message: `decent: convert modules/<bucket>/<file1>,<file2>,... to ESM`.

#### After all files are converted

- Add `"type": "module"` to root `package.json`.  (Server-side `.js` files may break if
  they use CommonJS — verify.  If they do, either convert them too or rename to `.cjs`.
  This may bleed into server code, which is out of scope for this work order.  **Check
  with Ev before adding `"type": "module"` at the root.**)
- Replace `wire.js` (née `plugs.js`) with the explicit resolver if Option B was chosen.
- Delete `depject` from `dependencies` if Option B.

**Deliverable:** every `decent/src/**/*.js` uses `import`/`export` and `const`/`let`;
`wire.js` explicitly lists every plugin; `npm run build:web` works; `npm test` passes; the
Decent app loads in the browser and every screen still works (spot-check: public feed,
friends, private, thread view, profile edit, avatar upload, git repo browse, search).

---

### Phase 3 — Build tooling swap (esbuild)

**Goal:** replace `browserify` + `indexhtmlify` + `postprocess-index.js` with one esbuild
config.

**Status:** Not started

**Start only after Phase 2 is merged.**

#### Plan

1. Add `esbuild` to `devDependencies`.
2. Write `decent/build.mjs` (ESM build script):
   - Uses `esbuild.build()` to bundle `decent/src/main.js` → `decent/build/bundle.js`.
   - Reads `decent/src/style.css`, writes `decent/build/style.css` (or inlines; see below).
   - Reads a template `decent/src/index.template.html`, substitutes `{{bundle}}` and
     `{{style}}` placeholders, writes `decent/build/index.html`.
3. Update root `package.json` `build:web` to `node decent/build.mjs`.
4. Delete `browserify`, `indexhtmlify`, `browselectrify` from `devDependencies`.
5. Delete `decent/scripts/style.js` and `decent/scripts/postprocess-index.js` (fold their
   logic into `decent/build.mjs`).

#### Output must match

The final `decent/build/index.html` must still be a single file with everything inlined
(match current behavior).  Serve it from the existing `plugins/decent-ui.js` route and
confirm the app loads without network errors for missing assets.

#### Dev mode

Add `npm run dev:web` that runs `esbuild --watch` and rebuilds on source change.  Useful
during Phase 4 and beyond.

**Deliverable:** one esbuild invocation replaces the three-tool pipeline; build time
drops significantly; `decent/scripts/` becomes empty (or just contains the build config);
bundle loads in browser with no regressions.

---

### Phase 4 — DOM layer modernization (OPTIONAL, DEFER)

**Goal (aspirational):** replace `hyperscript` with `htm` tagged templates or native web
components.

**Status:** Not started — **do not start without explicit Ev sign-off.**

This phase touches every UI module.  High churn, modest legibility gain.  Ship phases 1–3
first, live with them, then decide if this is worth doing.

When/if you start this phase, write a new work order document specifically for it.  Do
not try to cram the DOM rewrite into this doc.

---

## Verification checklist (run before declaring the work order complete)

- [ ] `ls decent/` shows `src/`, `build/`, `scripts/` (or empty), `README.md`, `LICENSE`.
      No stray files at `decent/` root.
- [ ] One `package.json` at repo root.  No `decent/package.json`.
- [ ] One lockfile at repo root (`npm-shrinkwrap.json`).  No `decent/yarn.lock`.
- [ ] `npm install` at repo root installs everything.
- [ ] `npm run build:web` produces `decent/build/index.html`.
- [ ] `npm test` passes with 0 failures.
- [ ] `node bin.js start` serves the app at `http://127.0.0.1:8888/` and every screen
      loads: public, friends, private, notifications, key, a profile page, a thread,
      a git repo browse, search results.
- [ ] `git log` shows one commit per logical chunk, with co-author trailers.
- [ ] Both remotes (`origin` and `ssb`) are up to date.
- [ ] `AGENTS.md` reflects any structural changes (key directories table, build commands).

---

## If you hit a blocker

- **A file won't convert cleanly** → commit what works, note the file in the commit
  message, move on.  Don't get stuck.
- **The build breaks and the error is cryptic** → `npm run build:web 2>&1 | tail -40`
  and read carefully.  Browserify's error messages are bad; esbuild's are better (another
  reason for Phase 3).
- **A test fails that wasn't failing before** → stop.  Your change broke something.  Do
  not proceed.  Either fix it or revert.
- **Ev pushes changes mid-session** → `git pull --rebase`, resolve any conflicts, keep
  going.
- **A module uses a pattern you don't understand** → read the other modules that `need`
  or `give` the same key; the wiring tells you what's expected.  Also read `src/wire.js`
  for what `'first'` and `'map'` mean.

## When you're done with a phase

1. `npm run build:web && npm test` — both must be clean.
2. Start `node bin.js start`, open the browser, click around.
3. Commit with a descriptive message + co-author trailer.
4. Push to BOTH remotes (`origin` AND `ssb`).
5. Update this file: change phase status to "Done" and add a one-line note about anything
   that surprised you.
6. Commit the work-order update + push both.
7. Ask Ev if you should start the next phase.
