# Work Order: Blob view action row

**Status:** Partially shipped
**Depends on:** `git-ui-polish-work-order.md` has landed Tasks 1 and 2 (shared subheader, ref picker, clone card). Task 3 from that order is otherwise untouched by this work — only the blob-view portion is in scope here.
**Intent:** Add the flat row of file-level actions that every mature git forge places above a file's contents. Ship the live actions now and hide the actions that still need server work until their backend/API support lands.

## Session log — 2026-04-19

This work order is no longer just planned; most of the client work has landed:

- `renderBlobScreen` now inserts the action row for text, markdown, and image blobs.
- `Raw` is live and opens the raw blob URL in a new tab.
- `Copy path` is live and uses a temporary copied state.
- Text/markdown blobs show source metadata (`N lines · size`).
- The CSS was adjusted so the action row and blob pane render as one stacked unit within the current forge UI.

What remains open is exactly the server-backed part:

- `History` is hidden until we have a path-history endpoint.
- `Blame` is hidden until we have a blame endpoint.
- Line numbers / line-range links are still tracked by `git-ui-polish-work-order.md`; they are not part of this row-specific chunk.

## Why this work order exists

Today, `renderBlobScreen` in `decent/src/modules/git/git-browser.js` renders a file as: subheader → highlighted `<pre>` (or `<img>` / rendered markdown). There is no way to:

- Open the raw bytes in a new tab (the URL exists — `rawBlobUrl` — but it is not surfaced).
- Copy the file's path to share with a colleague.
- Leave room for per-file history and blame without hard-coding a second layout pass later.

Adding a clean action row now locks in the UI shape so the eventual History / Blame endpoints slot in without a re-layout.

## Where the work lives

- **`decent/src/modules/git/git-browser.js`** — `renderBlobScreen` starts at ~line 585. `rawBlobUrl` helper at ~line 580. Add a new `renderBlobActionRow(repoId, ref, pathParts, opts)` helper near them.
- **`decent/src/style.css`** — add a `.git-blob-actions` block next to the other `.git-blob-*` rules (grep for `.git-blob-content`).
- **No server changes.** Do not touch `plugins/git-server.js`.

Rebuild the web bundle with `npm run build:web` after edits. Confirm visually at `http://127.0.0.1:8989/#git/<repoId>/blob/main/<path>`.

## Scope

The action row appears on **every blob view**:

1. Text file (highlighted `<pre>`)
2. Markdown (rendered via `api.markdown`)
3. Image blob (the `IMAGE_EXTS` branch)

It sits between the subheader (`renderRepoSubheader`) and the file content. Single flex row, hairline bottom border, 8px vertical padding, flush with the content width.

## Visual layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ <subheader: tabs + ref picker + breadcrumbs>                         │
├──────────────────────────────────────────────────────────────────────┤
│  1048 lines · 38 KB                              [Raw ↗]  [⧉ Copy path] │
├──────────────────────────────────────────────────────────────────────┤
│  file content …                                                      │
```

- **Left slot** — dim metadata (`.git-blob-meta`). Present for text and markdown; omitted for images. Format: `N lines · S KB` (e.g. `1048 lines · 38 KB`). Size uses binary KB (`bytes / 1024`, one decimal for <100 KB, integer otherwise). Hide the metadata element entirely when absent; do not leave a ghost gap — `justify-content: space-between` handles this when the left side is missing.
- **Right slot** — the button cluster (`.git-blob-actions-buttons`). Flex row, 6px gap, buttons render as small squared-off controls.

## Buttons

### Raw — always live

- Rendered as `<a class="git-blob-action" target="_blank" rel="noopener">` pointing to `rawBlobUrl(repoId, ref, pathParts)`.
- Icon: Material Symbol `open_in_new`. Label: `Raw`.
- No special state handling — it is a link.

### Copy path — always live

- Rendered as `<button class="git-blob-action" type="button">`.
- Icon: Material Symbol `content_copy`. Label: `Copy path`.
- On click:
  - `navigator.clipboard.writeText(pathParts.join('/'))` — the repo-relative path (e.g. `src/modules/git/git-browser.js`). Not a URL, not absolute.
  - On success: swap icon to `check`, label to `Copied`, for 1200 ms, then revert.
  - On failure (rare; clipboard API can reject): revert immediately, no toast.

### Blame — hidden for now

- Do **not** render a Blame button yet.
- We will show it only after the server can answer a blob blame query for a specific repo/ref/path and return line-attribution data the client can render.

### History — hidden for now

- Do **not** render a History button yet.
- We will show it only after the server can answer a file-history query for a specific repo/ref/path and return the commit list for that path.

## Metadata computation

Inside the text branch of `renderBlobScreen`:

```js
var content = data.content || ''
var lineCount = content ? content.split('\n').length : 0
var byteSize  = new TextEncoder().encode(content).length
```

Inside the markdown branch, same calculation against the source `data.content` (pre-render). That's what users want — lines/bytes of the markdown source.

Format for the meta slot:

```js
function formatBytes(n) {
  if (n < 1024) return n + ' B'
  var kb = n / 1024
  if (kb < 100) return kb.toFixed(1) + ' KB'
  if (kb < 1024) return Math.round(kb) + ' KB'
  return (kb / 1024).toFixed(1) + ' MB'
}

var metaText = lineCount + ' lines · ' + formatBytes(byteSize)
```

Do not add this helper as an export; inline it in `git-browser.js` near the other local helpers.

## Helper shape

```js
// opts: { withMeta: bool, lineCount?: number, byteSize?: number, variant: 'text' | 'markdown' | 'image' }
function renderBlobActionRow(repoId, ref, pathParts, opts) {
  var isImage = opts.variant === 'image'

  var meta = (opts.withMeta && !isImage)
    ? h('div.git-blob-meta',
        opts.lineCount + ' lines · ' + formatBytes(opts.byteSize))
    : null

  var rawHref = rawBlobUrl(repoId, ref, pathParts)

  var rawBtn = h('a.git-blob-action',
    { href: rawHref, target: '_blank', rel: 'noopener' },
    h('span.material-symbols-outlined', 'open_in_new'),
    h('span.git-blob-action-label', 'Raw'))

  var copyBtn = h('button.git-blob-action', { type: 'button' },
    h('span.material-symbols-outlined', 'content_copy'),
    h('span.git-blob-action-label', 'Copy path'))
  copyBtn.addEventListener('click', function () {
    var path = pathParts.join('/')
    navigator.clipboard.writeText(path).then(function () {
      copyBtn.classList.add('is-copied')
      copyBtn.querySelector('.material-symbols-outlined').textContent = 'check'
      copyBtn.querySelector('.git-blob-action-label').textContent = 'Copied'
      setTimeout(function () {
        copyBtn.classList.remove('is-copied')
        copyBtn.querySelector('.material-symbols-outlined').textContent = 'content_copy'
        copyBtn.querySelector('.git-blob-action-label').textContent = 'Copy path'
      }, 1200)
    }, function () { /* silently ignore */ })
  })

  var buttons = [rawBtn, copyBtn]

  return h('div.git-blob-actions',
    meta,
    h('div.git-blob-actions-buttons', buttons))
}
```

Exact implementation may differ but the structure above is what the CSS expects.

## Follow-up work required before showing `History` / `Blame`

This work order is intentionally client-only. The buttons stay hidden until a follow-up server/API work order lands. That later work needs to cover at least these pieces:

### Server endpoints

- **Per-file history endpoint** in `plugins/git-server.js`
  - Input: `repoId`, `ref`, `path`
  - Output: ordered commit list for that path, with enough metadata to render a commit list or jump to commit screens (`sha1`, title, author, date at minimum)
- **Per-line blame endpoint** in `plugins/git-server.js`
  - Input: `repoId`, `ref`, `path`
  - Output: blame hunks or line-level attribution for the current blob, including commit id plus author/date fields needed for UI display

### Client integration

- Add client fetch helpers in `decent/src/modules/git/git-browser.js` for the new JSON routes.
- Decide whether `History` opens:
  - a dedicated blob-history screen for that path, or
  - the existing commit/log screen filtered to a path
- Decide whether `Blame` opens:
  - a dedicated blame view, or
  - an in-place alternate rendering mode of the blob view
- Re-show the buttons only for text/markdown blobs once those routes are live and wired.

### Data and UX constraints

- `History` must be path-specific, not the repo-wide log currently exposed by `/json/log/:ref`.
- `Blame` must attribute the blob at the currently selected ref, not just `HEAD`.
- Both actions should preserve the current repo/ref/path context in the route so back/forward navigation stays sane.
- Image blobs should continue to hide both actions unless we later design image-specific history behavior.

## Wiring into `renderBlobScreen`

Three insertion points — one per branch:

### Image branch

```js
h('div.git-browser',
  renderRepoSubheader(...),
  renderBlobActionRow(repoId, ref, pathParts, { variant: 'image', withMeta: false }),
  h('div.git-image-view', h('img.git-blob-image', ...)))
```

### Text branch

```js
var content = data.content || ''
var lineCount = content ? content.split('\n').length : 0
var byteSize  = new TextEncoder().encode(content).length

h('div.git-browser',
  renderRepoSubheader(...),
  renderBlobActionRow(repoId, ref, pathParts, {
    variant: 'text', withMeta: true, lineCount: lineCount, byteSize: byteSize }),
  contentEl)
```

### Markdown branch

Identical to text but `variant: 'markdown'`. The metadata counts the source, not the rendered output.

## CSS

Add next to the existing `.git-blob-content` rules in `decent/src/style.css`. Target selectors and approximate values:

```css
.git-blob-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border: 1px solid #d0d7de;
  border-bottom: none;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
  background: #f6f8fa;
  font-size: 0.88em;
}

.git-blob-meta {
  color: #656d76;
}

.git-blob-actions-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.git-blob-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #ffffff;
  color: #24292f;
  font-size: 0.88em;
  text-decoration: none;
  cursor: pointer;
  line-height: 1.3;
}

.git-blob-action:hover:not(.is-disabled):not([disabled]) {
  background: #f3f4f6;
  border-color: #afb8c1;
  color: #0969da;
}

.git-blob-action.is-disabled,
.git-blob-action[disabled] {
  color: #8c959f;
  cursor: not-allowed;
  background: #f6f8fa;
}

.git-blob-action.is-copied {
  background: #dafbe1;
  border-color: #aceebb;
  color: #1a7f37;
}

.git-blob-action .material-symbols-outlined {
  font-size: 1.05em;
  vertical-align: -2px;
}
```

Confirm that the action row's bottom edge aligns with the top of the existing `.git-blob-content` / `.git-readme` / `.git-image-view` container. The existing content elements may need their top-left/top-right radius removed so the join looks continuous. Check by screenshot.

## Accessibility

- Disabled buttons use the native `disabled` attribute, not just a class — so screen readers announce them correctly and they cannot be activated with the keyboard.
- The Raw `<a>` keeps its normal link semantics; do not use `role="button"`.
- The Copy-path button must be keyboard-activatable (default for `<button>` — don't break it).
- `title` attributes carry the "coming soon" reasoning, giving sighted users the explanation on hover. Leaving the label visible (not icon-only) means the purpose is readable without hover.

## Non-goals

- **No per-file history endpoint.** Blame and History stay disabled. If you find yourself writing `log-per-path` routes on `git-server.js`, stop — that is a separate work order.
- **No line numbers, no line-range anchors.** Those are part of Task 3 of `git-ui-polish-work-order.md` and should be tackled together with the contrast / line-number CSS.
- **No "Edit" button.** Editing through the browser is a multi-layer feature (compose, sign, push) and out of scope.
- **No permalink-at-commit toggle.** Nice to have but belongs in its own row of work, ideally alongside the ref picker's own permalink affordance.
- **No changes to `renderReadme`.** Heading anchors are covered by the existing polish WO.
- **No icon-only mode.** Always render the label next to the icon.
- **Do not swap the existing Material Symbols tab icons for different ones** — out of scope and already landed.

## Testing

- Navigate to a text file (`#git/<id>/blob/main/README.md`): action row appears; metadata reads plausible numbers; Raw opens the raw response in a new tab; Copy path copies `README.md` (no leading slash).
- Navigate to a nested file (`#git/<id>/blob/main/decent/src/style.css`): Copy path copies `decent/src/style.css`.
- Navigate to an image blob (`#git/<id>/blob/main/docs/img/something.png`): action row shows only Raw + Copy path, no metadata.
- Hover over Blame and History on a text file: cursor turns to `not-allowed`, tooltip appears, clicking does nothing.
- Click Copy path: the button swaps to a green "Copied" state for ~1.2 s and reverts.
- Reload after switching branches via the ref picker: Raw, Copy path all reflect the new ref.
- Playwright screenshot: save to `docs/img/git-blob-action-row.png`. Also re-take `docs/img/git-repo-blob.after.png` showing the action row sitting cleanly above the highlighted code.

## Done when

- `renderBlobActionRow` exists and is called from all three branches of `renderBlobScreen`.
- On text and markdown blobs: metadata + Raw + Blame (disabled) + History (disabled) + Copy path render on one line, right-aligned buttons, left-aligned meta.
- On image blobs: Raw + Copy path only. No Blame, no History, no meta slot.
- Raw opens the raw bytes in a new tab. Copy path copies the repo-relative path and shows a transient "Copied" confirmation. Blame and History surface their "coming soon" tooltips but cannot be activated.
- CSS matches the existing git-forge visual language (colours, border radius, font sizing) and does not disturb the existing feed card, log-row, tree table, or clone card.
- `npm run build:web` succeeds. A screenshot at `docs/img/git-blob-action-row.png` shows the row on a representative text file.
- No changes to `plugins/git-server.js`. No new SSB message types. No new routes.
