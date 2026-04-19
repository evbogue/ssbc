# Work Order: Git forge UI polish

**Status:** Partially shipped (see Session log below)

## Session log — 2026-04-19

Follow-on work landed after the initial polish pass:

- **Blob action row shipped in the blob view.** `git-browser.js` now renders a stacked action row above blob content for text, markdown, and image blobs. Live actions are `Raw` and `Copy path`; metadata shows source line count + byte size for text/markdown.
- **History / Blame intentionally hidden.** We initially mocked these as disabled controls, then removed them from the row until the server exposes path-history and blame endpoints. The follow-up requirements are documented in `docs/git-blob-action-row-work-order.md`.
- **Blob pane styling integrated with the current UX.** The blob action row and content pane now render as one unit rather than two competing bordered boxes.
- **Push messages now expose pull-request creation in the action bar.** `git-update` SSB push messages render a compact Material-symbol `merge_type` button in the message action/reaction row. Clicking it resolves the repo and opens the inline pull-request composer from the push message itself.

### Still open from Tasks 1–3 after 2026-04-19

- **Task 1**: repo-home clone-row Copy button still missing.
- **Task 2**: real ref picker (popover with search, Branches/Tags tabs, no 10-ref cap) not built. Sidebar removal and shared forge-width work already landed.
- **Task 3**:
  - Blob action row is done.
  - Tree latest-commit banner is still missing.
  - Blob line numbers / `?lines=N` anchors are still missing.
  - Tree file icons are still emoji unless changed in a later session.
  - Light syntax-highlight palette still needs explicit verification against the current blob views.

## Session log — 2026-04-18

Side-quests landed while iterating with Playwright (not items from Tasks 1–3, but pre-reqs / fallout):

- **Diff letter-tower fix.** `git-browser.js` diff renderer used `{colspan: '4'}` — hyperscript treats `colspan` as a JS prop, but the DOM property is `colSpan` (camelCase). The spanning `<td>` collapsed to col 1, producing the vertical letter tower in diffs. Fixed in 4 places.
- **App-wide 680px cap removed for git forge only.** `.scroller__wrapper { max-width: 680px }` was squeezing every git screen. Added `.scroller__wrapper:has(> .git-forge-layout) { max-width: 1120px; }` so the cap only widens for git pages — feed/profile/etc. unchanged.
- **Active-tab indicator works.** `h('a.git-forge-tab', {className: 'active'}, ...)` — props.className was overwriting the selector class, so the rendered class was just `"active"`. Refactored tabs to `h('a.git-forge-tab' + (active ? '.active' : ''), …)` via a `tab()` helper.
- **Redundant breadcrumb removed** when path is empty (repo home / log / commit).
- **Activity tab now renders real SSB messages.** `renderActivityScreen` was emitting custom summary rows; replaced with `api.message_render(link)` over `sbot_links({dest: repoId})` so push/issue/comment/PR messages all show with their normal Decent rendering (avatar, time, reply/like actions, etc.).
- **Push-message commit area flattened.** Killed the inner `.git-commits` / `.git-commit` wrapper divs (white card with grey border around commit rows). The duplicate sha (one in branch-ref row, one in commit row) is now shown once. Body preview is plain non-italic text. Commit row + body now render as flat `<p>` elements, no nested divs.

### Still open from Tasks 1–3 at that point

- **Task 1**: clone-row Copy button still missing.
- **Task 2**: real ref picker (popover with search, Branches/Tags tabs, no 10-ref cap) not built. Sidebar already removed by Codex earlier.
- **Task 3**: tree last-commit banner, blob line numbers / `?lines=N` anchors, blob action row (Raw / Copy path / disabled History+Blame), light syntax-highlight palette — none done at that point. Material Symbols already in use elsewhere; tree still uses 📁/📄 emoji.


**Intent:** Make the existing git-forge screens in Decent feel right — fix visible layout bugs, make navigation between branches work from every screen, and bring the tree and blob views up to the density a developer expects from a git forge. Read-only only. No new git-server endpoints, no new SSB message types, no issues/PR/settings work.

## Why this work order exists

The git-forge screens render the right data but several surfaces look broken or underbuilt next to GitHub, Gitea, and Codeberg. The three highest-leverage fixes are bundled here because they overlap in CSS and in the shared repo header. Doing them together avoids the UI being re-laid-out three times.

A previous session captured these screenshots at `decent/../.playwright-mcp/`:
- `git-repo-main.png` — repo home with a vertical letter-tower rendering of "Default Branch: main"
- `git-repo-tree.png` — tree view with the cramped left "Files" tile grid
- `git-repo-blob.png`, `git-repo-blob-js.png` — blob views without line numbers or raw/history/blame buttons
- `git-repo-log.png` — log with the unexplained green "Local" bars

Re-capture equivalents after the work lands and compare.

## Context for the implementer

All of this lives in the Decent frontend. The relevant files:

- `decent/src/modules/git/git-browser.js` — every repo sub-screen: repo home, tree, blob, log, commit, issues/PRs list, activity, settings. Renders via `hyperscript` (`h(...)`) into a container the screen module hands it.
- `decent/src/modules/git/git.js` — top-level repo page, tab bar, routes every `git/<id>/<sub>` URL to `git-browser.js` via `screen_view`.
- `decent/src/modules/git/git-repos.js` — repo list at `#repos`.
- `decent/src/style.css` — all styling. Classes under `.git-forge-*`, `.git-branch-*`, `.git-tree-*`, `.git-blob-*`, `.git-sidebar-*`, `.git-clone-*`. Grep around line 1005 and line 2146 for the two main blocks.
- `decent/src/modules/git/highlight.js` — syntax highlighter for blobs.
- `plugins/git-server.js` — HTTP API behind `gitApiUrl(repoId, sub)`. **Do not change this file.** The endpoints you will use are already here: `refs`, `tree/<ref>[/<path>]`, `blob/<ref>/<path>`, `raw/<ref>/<path>`, `log/<ref>`, `commit/<sha>`, `diff/<sha>`. If you believe you need a new endpoint, stop and raise it.

Rebuild the web bundle with `npm run build:web` after edits. The CLI server reads `decent/build/index.html`.

The dev server runs on port 8989 by default. Drive it from Playwright at `http://127.0.0.1:8989/#repos`. Two `ssbc` repos exist locally; pick either for testing.

## Task 1: Fix the repo-home header

Target file: `decent/src/modules/git/git-browser.js`, `renderRepoScreen` around line 227. CSS lives at `decent/src/style.css:2276` (`.git-forge-repo-meta`).

### The bug

The meta row at line 267–270 contains two flex items on one line:
1. `"Default Branch: " + branch badge`
2. `"Clone locally: " + clone URL code block`

`.git-forge-repo-meta` is `display: flex; gap: 16px;` with no `flex-wrap`. `.git-clone-input` inside item 2 is `flex: 1` with `overflow: hidden; text-overflow: ellipsis`. When the repo-home main column is narrow (because the 280px sidebar is also present), item 2 grows and squeezes item 1 to near-zero width. The squeezed item's inline text then wraps per-character, producing the vertical letter tower visible in the screenshot.

### What to do

- Stack the meta items vertically on the repo home. Easiest fix: change `.git-forge-repo-meta` to `flex-direction: column; gap: 8px;` or `flex-wrap: wrap;` and add `flex-shrink: 0;` to `.git-forge-repo-meta-item`. Column is simpler.
- Give the clone URL a visible **Copy** button that copies `git clone <url>` to the clipboard (`navigator.clipboard.writeText`). Button goes at the end of the clone row, inside the same meta item. Show a transient "Copied" state for ~1s on success. No library needed.
- Do not truncate the clone URL into `…`. With the row now stacked full-width, the URL fits on one line at normal viewport widths; allow wrap rather than ellipsis if it doesn't.
- The branch label on the repo home is currently just a static badge. It should become a proper **picker** — see Task 2. If Task 2 is landing in the same PR, wire it here now; if not, leave the static badge.

### Done when

- The repo home renders "Default Branch: main" and "Clone locally: …" on two clean rows with no vertical letter tower at any viewport width ≥ 768px.
- The Copy button copies the full `git clone <url>` string and confirms visibly.
- Re-run the live site and re-screenshot to `docs/img/git-repo-main.png`. Diff against the pre-change screenshot in the PR description.

## Task 2: Unify the repo sub-nav and build a real branch picker

Target files: `decent/src/modules/git/git-browser.js` (`renderBranchBar` at line 281, every `renderXScreen` from line 227 onward), `decent/src/modules/git/git.js` (tab header), `decent/src/style.css` (`.git-branch-bar`, `.git-branch-badge`, `.git-forge-sidebar`, `.git-forge-main`).

### The problems

1. `renderBranchBar` is only called from `renderTreeScreen` (line 325). The repo home, blob view, commit view, and log page have no branch switcher at all. Reaching a different branch from the log page requires editing the URL by hand.
2. The branch bar hard-caps at 10 refs (`refs.slice(0, 10)` line 290). Branches 11+ are unreachable from the UI.
3. The bar is a flat row of `<a>` badges — no search, no separation of branches vs tags.
4. `renderSidebar` (line 139) adds a left-hand `.git-forge-sidebar` to **every** code-related screen. It shows top-level tree entries as icon+name tiles and never reflects the current subpath. It duplicates information already present in the main column on the tree screen, and wastes space on the repo home and blob screens. It is the reason the main column is squeezed on the repo home.

### What to do

- **Delete the sidebar everywhere it appears.** Remove the `renderSidebar(...)` calls in `renderRepoScreen`, `renderTreeScreen`, `renderBlobScreen`, and the image-view branch of `renderBlobScreen`. Then delete `renderSidebar` itself and the associated CSS (`.git-forge-sidebar`, `.git-sidebar-*`). The main column becomes full-width (minus the site's outer container gutter). The file `renderSidebar` was useful when the main table was sparse; now it fights with the tree table and the README. If a future tree-drawer is wanted, it should be its own work order.
- **Move the branch picker into a shared repo header.** Today `git.js` renders the repo title and the Code / Commits / Issues / Pull Requests / Activity tab bar. Extend that header so every repo sub-screen also renders, below the tabs, a single row containing:
  - A **ref picker** on the left (see below).
  - The **breadcrumbs** on the right (today's `breadcrumbs(repoId, ref, pathParts)` output, which only appears on tree and blob). On the repo home, commit, and log screens the breadcrumbs collapse to just the repo name / ref.
  - When the current screen is a log view, also show a small "viewing: log" hint to clarify that changing the ref will reload the log at that ref.
- **Ref picker behaviour:**
  - A button showing `⎇ <current-ref>`. Clicking opens a popover.
  - The popover has a text input at the top, two tab headers "Branches" / "Tags", and a scrolling list below. Use `fetchJson(gitApiUrl(repoId, 'refs'))` once per repo and cache for the session.
  - Branches come from refs matching `^refs/heads/`. Tags from `^refs/tags/`. Strip the prefixes for display. Show the HEAD branch at the top with a "default" marker.
  - Typing filters the list client-side by substring, case-insensitive.
  - Selecting an entry navigates via `gitBrowseRoute(repoId, screen, branch, pathParts)` where `screen` and `pathParts` come from the current URL. On the blob screen, preserve the file path. On the log screen, navigate to `#git/<id>/log/<ref>`.
  - No hard cap on ref count. If the list is long, the popover scrolls.
  - Keyboard: Esc closes; Enter picks the first filtered result; arrow keys move the highlight.
  - Close on click-outside.
- **Remove** the old `renderBranchBar` entirely once every caller uses the new picker. Delete related CSS (`.git-branch-bar`, but keep `.git-branch-badge` — it is used elsewhere).
- The picker should degrade gracefully if `refs` errors: show "`⎇ <current-ref>`" as a disabled button with a tooltip "refs unavailable".

### Done when

- The ref picker appears on the repo home, tree, blob, commit, and log screens. It works identically on all of them and preserves the current path where relevant.
- A repo with 20 synthetic branches is fully reachable through the picker. (Make the branches locally for testing — `git branch b1 … b20 && git push ssb --all`.)
- Tags show up under the Tags tab of the picker.
- The left-hand `.git-forge-sidebar` is gone from every screen. The main column is full width.
- Verified by Playwright: navigate to `#git/<id>/log/main`, click the picker, switch to another branch, end up at `#git/<id>/log/<other>`.

## Task 3: Tree and blob density

Target files: `decent/src/modules/git/git-browser.js` (`renderTreeScreen` at 302, `renderBlobScreen` at 342, `rawBlobUrl` at 337), `decent/src/modules/git/highlight.js` (palette), `decent/src/style.css`.

### Tree screen

Today `renderTreeScreen` produces a three-column table: icon · name · empty meta cell (line 317 is `' '`). File size, last commit message, and time are all missing.

- Replace the empty meta cell with three new columns: **last commit message** (truncated to ~60 chars with full text in `title`), **relative time**, **short SHA** (links to the commit page). Order: icon · name · message · time · sha.
- Data source: the git-server already exposes `log/<ref>` which returns all commits. There is no per-path last-commit endpoint. Implement this client-side: when the tree screen loads, also call `fetchJson(gitApiUrl(repoId, 'log/' + ref))`, then for each entry in the tree, scan the commits in reverse-chronological order and find the first commit whose diff touches that path. This requires a per-commit `diff/<sha>` call, which is heavy. **Do not do this naïvely.** Two options, pick one:
  - **Option A (ship first):** show a single "latest commit" banner at the top of the tree (subject + short sha + author + relative time), fetched from `log/<ref>`'s first entry. Leave the per-file columns empty-but-styled so future work slots in. Cheap, honest, no perf risk.
  - **Option B (future):** add a `git-server.js` endpoint `log-per-path/<ref>` that returns `{path: {sha, subject, time}}` for the direct entries of one directory. Out of scope for this work order; do not build it here.
- Prefer Option A for this PR. Note in code with a one-line comment pointing to the future endpoint.
- Replace the emoji icons (📁 / 📄 line 310) with small inline SVGs or Material-style glyphs. The site already uses Material Symbols (see the topnav in `git-repos.js` and main.js). Use `folder` and `description` or `insert_drive_file` to match.
- Sort: directories first, then files, each alphabetically. Confirm `git-server.js` returns in that order; if not, sort client-side before render.

### Blob screen (non-markdown)

- **Line numbers**: before each line of highlighted code, add a `<span class="git-blob-line-no">N</span>`. Implement by splitting `data.content` on `\n` and rendering one `<div class="git-blob-line" id="L<N>"><span class="git-blob-line-no">N</span><code>…</code></div>` per line. The highlighter currently returns one big HTML string — you will need to either re-run it per line or split the output on real newlines after highlight (prefer the latter; `highlight.js`-style output preserves newlines).
- **Range anchors**: `#L12` highlights line 12 by adding a background colour. Shift-click on a line number extends the range to `#L12-L20`. On load, parse `location.hash` and apply the highlight. Do not hijack the main router hash — the blob URL uses `#git/<id>/blob/<ref>/<path>`; add support for a secondary `?L=12-20` query param or a `#L12-20` suffix **after** the route. The simplest approach: the blob route is already hash-based, so add a convention: `#git/<id>/blob/<ref>/<path>#L12-20` will not work (only one hash allowed). Use `?lines=12-20` appended to the URL and read `location.search`. Document the format in a code comment.
- **Action row** at the top of the blob view, above the content: a small flex row with four buttons/links:
  - **Raw** → `rawBlobUrl(...)` (opens in new tab).
  - **History** → disabled with a tooltip "coming soon" (requires per-path log endpoint; out of scope).
  - **Blame** → disabled with tooltip (same reason).
  - **Copy path** → copies the path-from-repo-root to clipboard.
  - Leave the disabled buttons visible so the UI shape stabilizes; an implementer picking up the next work order will fill them in.
- **Highlight contrast**: the current `.git-blob-content.git-highlighted` uses a dark background with dark blue keywords, producing low contrast. Two choices:
  - Light palette on a light card background. GitHub-style. Matches the rest of the site.
  - Dark palette on a clearly-dark card. Also fine but out of place.
  - Pick the light palette. Adjust `highlight.js` CSS classes in `style.css` accordingly. Verify against `plugins/decent-ui.js` rendered at `git-repo-blob-js.png`-equivalent.

### Blob screen (markdown)

- Keep the current `api.markdown({text})` rendering.
- Add heading anchor links: every `<h1>`–`<h6>` gets an id derived from its slugified text, and a `#` link appears on hover to the left. Do this as a post-render DOM walk inside `renderReadme` (line 203).
- Keep the action row from the non-markdown case (Raw, Copy path, etc.) above the rendered markdown.

### Done when

- Tree rows include the icon, name, and (if Option A) a "latest commit" banner above the table.
- Tree icons use Material Symbols, not emoji.
- Blob views for .js, .css, .json, .md, .txt, .py, .go, .rs all render with line numbers and readable contrast.
- Clicking a line number updates the URL to `?lines=N` and highlights the line. Reloading preserves the highlight.
- Action row appears on every blob view; Raw works; Copy path works; History and Blame are visibly disabled with tooltips.

## Cross-cutting: verification

- Rebuild with `npm run build:web` after each task. Don't commit the build output; the repo's `.gitignore` should already cover `decent/build/`.
- Use Playwright to capture before/after screenshots. Save both into `docs/img/`:
  - `git-repo-main.before.png`, `git-repo-main.after.png`
  - `git-repo-tree.before.png`, `git-repo-tree.after.png`
  - `git-repo-blob-md.before.png`, `git-repo-blob-md.after.png`
  - `git-repo-blob-js.before.png`, `git-repo-blob-js.after.png`
  - `git-repo-log.before.png`, `git-repo-log.after.png` (even though this WO doesn't change log rendering, the shared header + picker will appear there)
- If CSS changes affect other Decent screens (feed, profile, friends, notifications), re-screenshot those too. `.git-branch-badge` is used outside the git screens; check.

## Out of scope for this work order

- Any change to `plugins/git-server.js`. If an endpoint is missing, note it and stop.
- Per-file last-commit metadata (Option B above). Next work order.
- Commit page redesign, log page redesign, pagination, filters. Next work order.
- Issues / PRs / activity / settings screens.
- Identity / author resolution / verified badges. Tracked in `git-identity-work-order.md`.
- Fork graph, contributor stats, code search.

## Done when (whole order)

- Tasks 1, 2, and 3 are each complete by their own "Done when" criteria.
- `git-browser.js` no longer contains `renderSidebar` or `renderBranchBar`, and no `.git-forge-sidebar` or `.git-branch-bar` CSS remains.
- The repo home, tree, blob, log, and commit screens all share the same header with tabs + ref picker + breadcrumbs.
- A developer who has never seen Decent can land on a repo home, switch branches, open the tree, click into a file, and link a colleague to a specific line range — all without editing URLs by hand.
