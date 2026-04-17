# AGENTS.md — ssbc / Decent

Guidelines for any AI agent (Claude, Codex, Cursor, etc.) or human collaborator
working in this repository.

## What this is

A Secure Scuttlebutt (SSB) social client called **Decent**, running as a Node.js server
with a browser-based frontend.  The server (`bin.js`, `plugins/`) speaks the SSB protocol;
the frontend (`decent/`) is a browserified single-page app.

## Development Best Practices

How Ev runs development in this repo.  These rules are not optional — follow them every
session unless Ev says otherwise in the current conversation.

### Rhythm of work

1. **Pull before starting.** `git pull` on the current branch.  Ev frequently commits between
   sessions; assume the tree has moved.
2. **Work in discrete, shippable chunks.** A chunk = one coherent change that leaves the
   branch in a working state.  Don't mix unrelated changes in one chunk.
3. **Build after every change.** Run `npm run build:web` for frontend edits.  A broken build
   is never an acceptable stopping point.
4. **Test before committing.** `npm test` must pass cleanly (0 failures).  If you touched the
   UI, verify the change in the browser before declaring done.
5. **Commit every chunk.** Never leave modified files sitting in the working tree at the end
   of a task.  If the change is done, it gets committed.  No "I'll commit these together
   later" — commit now.
6. **Push both remotes after every commit.** See "Pushing" below.  Pushing is part of
   committing, not a separate optional step.

### Commit messages

- Short imperative summary on the first line (e.g. `Fix bin.js IPv6 handling`).
- Reference issues/PRs with `(#762)` when applicable.
- Body (optional) explains the *why*, not the *what*.
- Co-author trailer when an AI agent wrote the change:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```

### Pushing — always both remotes

This repo has two remotes and pushes should always go to **both**:

- `origin` — GitHub (public source of truth)
- `ssb` — git-ssb (dogfooding; the Decent app surfaces these pushes in the feed)

```bash
PATH="$PATH:$(pwd)/node_modules/.bin" git push origin HEAD && \
PATH="$PATH:$(pwd)/node_modules/.bin" git push ssb HEAD
```

Rules:

- Check `git remote -v` if you're unsure which remotes exist.
- If `ssb` is not configured, push to `origin` only and **mention it** in your update —
  do not silently skip.
- If `ssb` is configured but push fails (e.g. sbot not running), **surface the error**
  rather than swallowing it.  Don't move on as if the push succeeded.
- Never `--force` push unless Ev explicitly asks.  Never force push to `main`.

### Style matching

- Server-side (`plugins/`, `lib/`, `test/`): modern — `const`/`let`, arrows, templates.
- Decent frontend (`decent/src/modules/**`): old-style — `var`, named functions, string concat.
- Don't refactor style as a side-effect of feature work.  File style is load-bearing.

### When Ev says "go"

Execute immediately.  Don't re-ask for confirmation on things already agreed in the
conversation.  If a wireframe was approved, build it; if a plan was approved, ship it.

### When to ask

- Destructive or irreversible actions not already authorized (force push, `rm -rf`, dropping
  data, rewriting history).
- Scope ambiguity that would change the shape of the change.
- A discovery that invalidates the plan (e.g. the file doesn't exist, the API works
  differently than expected).

Otherwise: proceed.

---

## Repository Structure

- Core entry: `index.js` exports the default `ssb-server` instance. CLI entry: `bin.js`
  (exposed as `ssb-server` / `sbot`).
- Library helpers live in `lib/` (CLI aliases, progress, validation). Vendored SSB packages
  live in `lib/vendor/`.
- Plugins live in `plugins/` — each is a secret-stack plugin with `{name, version, manifest, init}`.
- The Decent browser UI lives in `decent/`; build output goes to `decent/build/`.
- Tests live in `test/` and are plain Node scripts (mostly using `tape`). Use descriptive
  filenames like `caps.js`, `defaults.js`.
- System integration artifacts live in `systemd/`. Keep them minimal and distro-agnostic.
- Do not edit `node_modules/`; send fixes upstream and update dependencies instead.

### Key directories

| Path | What lives there |
|---|---|
| `plugins/` | Server-side SSB plugins (decent-ui, git-server) |
| `decent/src/modules/core/` | Low-level plumbing: SSB connection, message confirm, blob URLs, screen routing |
| `decent/src/modules/ui/` | Main UI components: avatar, feed, post, profile, follow, etc. |
| `decent/src/modules/git/` | Git and forge-related UI modules |
| `decent/src/modules/extras/` | Optional and experimental UI modules |
| `decent/build/` | Generated — do not edit by hand |
| `decent/src/style.css` | All CSS (single file, no preprocessor) |
| `test/` | Node.js tape tests |

## How to run

```bash
node bin.js start          # starts SSB server + HTTP UI at http://127.0.0.1:8888
npm run build:web          # rebuilds decent/build/ (run after any frontend change)
                           # equivalent to: cd decent && npm run lite
```

The server must be running before the browser app can connect.

## Build, Test, and Development Commands

- `npm install` – install dependencies (run once before development).
- `npm test` – run the full test suite (`node test/*.js`).
- `npm run test:pretty` – run tests with `tap-spec` output.
- `npm run coverage` – generate coverage via `nyc` (outputs `coverage/`).
- `npm start` – run the CLI locally (`node bin start`), equivalent to `ssb-server start`
  when installed globally.
- `npm run build:web` – rebuild the Decent frontend bundle.

## Architecture in two sentences

The **backend** (`plugins/decent-ui.js`) serves static assets, proxies blobs via
`/blobs/add` and `/blobs/get/:hash`, and handles git-ssb HTTP requests.  The **frontend**
(`decent/src/main.js`) is a plugin system where each module declares `needs`/`gives` keys that
are wired together at startup — think dependency injection without a framework.

## Coding Style & Naming Conventions

- Language: Node.js, CommonJS (`require`, `module.exports`), callback-style APIs and pull-streams.
- Indentation: 2 spaces, no hard tabs. Prefer single quotes and omit semicolons (match existing files).
- **Server-side** (`plugins/`, `lib/`, `test/`): use `const`/`let`, arrow functions, template literals.
- **Decent frontend** (`decent/src/modules/**`): use `var`, named functions, and string concatenation —
  match the existing old-style CommonJS in those files.  Do not mix styles within a module.
- File and symbol names: camelCase for functions/variables, kebab-case for CLI commands,
  lowerCamelCase JSON/config keys.

## Testing Guidelines

- Tests use `tape`. Structure as `test('description', function (t) { ... })` and ensure all
  async work calls `t.end()` or ends via plan.
- To run a single test file: `node test/<file>.js`.
- Prefer deterministic tests using temporary directories under `/tmp/` and
  `process.env.ssb_appname = 'test'`, as existing tests do.
- When adding features or fixing bugs, include or update tests to cover the behavior; check
  `npm run coverage` if changes are large.

## Commit & Pull Request Guidelines

- Commit messages: short, imperative summaries (e.g. `Update caps defaults`,
  `Fix bin.js IPv6 handling`), with issue/PR references like `(#762)` when applicable.
- Pull requests should explain the motivation, outline key changes, list how to reproduce
  and verify, and state which tests were run.
- For behavioral or CLI changes, update `README.md` and add small usage examples where helpful.

---

## SSB Message Types (protocol spec)

Source: scuttlebot.io (archived Feb 2021) + scuttlebutt protocol guide.

### `type: 'about'` — profile data

```js
{
  type:   'about',
  about:  FeedID,        // "@...ed25519" — who this is about
  name:   String,        // display name (optional)
  image:  BlobLink,      // avatar (optional)
}
```

`BlobLink` canonical form: `{ link: "&...sha256", size: Number, type: MimeType }`
Full optional fields: `link, width, height, name, size, type`.

**Our extensions** (non-standard, Patchwork-lineage, widely supported):
- `description` — bio text
- `headerImage` — banner photo (same BlobLink format)

**Avatar image:** Spec recommends 512×512px; we crop to 512×512px.
**Banner image:** We crop to 1600×534px (non-standard, no spec guidance).
**Blob link fields:** We include `link`, `size`, `type`, `width`, `height`, `name`.

### `type: 'post'` — text message

```js
{
  type:    'post',
  text:    String,       // markdown body (required)
  channel: String,       // optional channel name
  root:    MsgID,        // thread root (required if reply)
  branch:  MsgID,        // direct parent (required if reply; same as root for first reply)
  recps:   [FeedLink],   // recipients for private messages
  mentions: [Link],      // feeds, messages, or blobs referenced in text
}
```

**Hard limit: 8 KiB (8192 bytes) total message size** including headers.

### `type: 'contact'` — follow / block

```js
{
  type:      'contact',
  contact:   FeedID,     // who is being followed/blocked
  following: Boolean,
  blocking:  Boolean,    // optional
}
```

### `type: 'vote'` — like / reaction

```js
{
  type: 'vote',
  vote: {
    link:  MsgID,        // message being voted on
    value: -1 | 0 | 1,  // -1 = downvote, 0 = retract, 1 = upvote
    reason: String,      // optional label (spec field name)
  }
}
```

We publish `reason: emoji` per spec.  We read `reason || expression` for backwards
compatibility with any messages that used the old `expression` field name.
We also handle legacy votes where `vote` is a plain string.

### `type: 'pub'` — known pub advertisement

```js
{ type: 'pub', address: { host: String, port: Number, key: FeedID } }
```

### `type: 'git-repo'` — git-ssb repository

Created by `git-ssb create`. Tracked via `messagesByType({type: 'git-repo'})`.

---

## Core SSB server API

These are the methods we rely on (all in the official spec):

| Method | How we call it | Notes |
|---|---|---|
| `publish(content)` | `api.sbot_publish` | auto-signs, sequences, timestamps |
| `messagesByType({type, live})` | `api.sbot_messagesByType` | backed by SQLite — **use this** |
| `createUserStream({id, ...})` | `api.sbot_user_feed` | feed by author |
| `createLogStream(opts)` | `api.sbot_log` | raw log ordered by receipt time |
| `links({dest, rel, values, live})` | `api.sbot_links` | graph traversal |
| `get(msgid)` | `api.sbot_get` | fetch single message |
| `getLatest(feedid)` | `api.sbot_getLatest` | last message from feed |
| `whoami()` | `api.sbot_whoami` | current user's feed ID |
| `blobs.add(cb)` | HTTP `POST /blobs/add` | returns `&hash.sha256` |
| `blobs.get(hash)` | HTTP `GET /blobs/get/:hash` | retrieves blob bytes |

### What does NOT work here

`sbot.query.read` (flumeview-query / `api.sbot_query`) **returns empty results** — the
index is not built in this setup.  Do not use it.  Switch any code that uses it to
`sbot_messagesByType` or `sbot_links` as appropriate.

---

## Blob uploads

Blobs are uploaded via `POST /blobs/add` (raw binary body).  **Always decode the
data URL to binary before sending** — sending a base64 string instead produces a corrupt
blob that the browser cannot render as an image.

```js
var parts  = dataURL.split(',')
var mime   = parts[0].match(/:([^;]+)/)[1]
var binary = atob(parts[1])
var arr    = new Uint8Array(binary.length)
for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
xhr.send(arr)   // correct — binary bytes
// NOT: xhr.send(dataurlPackage.parse(dataURL).data)  — sends base64 string
```

The server returns the blob hash (`&...sha256`) as plain text.  Store the full
`{ link: hash, size: arr.length, type: mime }` object as the `image` / `headerImage` value.

---

## Decent Frontend Development

### Plugin system

- Each module exports `needs`, `gives`, and `create(api)`.
- `'first'` means the first registered implementation wins; `'map'` means all run and
  outputs are merged.
- After changing a module, rebuild with `npm run build:web`.
- The module system is in `decent/src/wire.js` and wired in `decent/src/main.js`.

### `'map'` vs `'first'` plug types

`message_meta` and `message_action` are both `'map'` — **all** registered providers run and
their outputs are collected.  Multiple modules contribute to the same post row:

| Plug | Providers |
|---|---|
| `message_meta` | `timestamp.js` (timestamp link), `private.js` (recipient chips), `like.js` (reaction chips) |
| `message_action` | `message.js` (reply btn), `repost.js` (share group), `like.js` (reaction group) |

Never assume a `'map'` plug has only one implementation.

### Key globals

- `window.CACHE` — in-memory object of all messages the client has seen, keyed by msg hash.
  Used for reaction counts, backlink detection, etc.  Read-only from UI modules.
- `require('../keys').id` — the current user's feed ID (`@...ed25519`).  Import as `selfId`.

### Hash routing

```js
window.location.hash = '#/'        // → public feed
window.location.hash = '#' + key   // → thread view for that SSB key
```

Cross-route intent is passed via `sessionStorage`:
- `decent_reply_intent` — consumed by `thread.js` to auto-open the reply composer
- `decent_quote_intent` — consumed by `public.js` to preload a quote

### SSB key encoding gotcha

**Never call `decodeURIComponent` on a raw SSB message key.**  Keys start with `%` followed
by base64; base64 characters after `%` frequently form valid percent-encoded sequences, so
`decodeURIComponent` silently mangles ~12% of real keys.  Always compare keys as raw strings.

### `vote` field name

The spec field is `vote.reason` (not `vote.expression`).  Always write `reason`; always read
`reason || expression` for backwards compatibility with older messages.

### Embedded post cards

`render-embedded-post.js` is the shared helper for both repost and quote inline cards.
It renders: kicker label → author avatar+name+reaction chips → markdown body.

`makeCardNavigable(el, targetId)` (defined in both `repost.js` and `post.js`) makes a card
element keyboard- and click-navigable while letting inner `<a>` / `<button>` elements handle
their own events.  Use this pattern for any future clickable card.

### Decent frontend uses `var`, not `const`/`let`

All existing modules in `decent/src/modules/**` use old-style `var` and CommonJS.  Match the
surrounding style — do not introduce `const`/`let` or arrow functions into these files.

---

## git-ssb workflow

```bash
# Create a new repo (after deleting .ssb database, the old remote is stale)
git remote remove ssb
./node_modules/.bin/git-ssb create ssb <repo-name>

# Push (git-remote-ssb must be in PATH)
PATH="$PATH:$(pwd)/node_modules/.bin" git push ssb HEAD:main
```

The git HTTP server at `http://127.0.0.1:8888/git/<encoded-hash>/` serves repos via
the smart protocol and is tested working.

See [Development Best Practices → Pushing](#pushing--always-both-remotes) for the
always-push-to-both-remotes rule.

---

## Testing with Playwright MCP

```
mcp__playwright__browser_navigate  →  http://127.0.0.1:8888/
```

Use `browser_file_upload` to test avatar/banner photo uploads.
Use `browser_network_requests` with `filter: 'blobs'` to verify upload requests.
Kill stuck browser processes with `pkill -9 -f "ms-playwright"` if needed.

---

## Agent Working Notes

This repository is actively developed with AI agents as collaborators.  Notes for future
sessions:

- **Always pull before starting work.** The human developer pushes to the same feature branch
  between sessions.  New files or refactors may have landed since the last session.
- **Read files you haven't seen before a pull introduces them** — don't assume you know what
  they do from the name alone.  `render-embedded-post.js` is a real example of a new shared
  helper that changed how both `repost.js` and `post.js` work.
- **Work in phases with clear deliverables.** Commit and push after each discrete piece of
  work so the human can review and the branch stays in a shippable state.
- **When the human says "go" with no open questions, execute immediately.**  Don't re-ask for
  confirmation on things already agreed.
- **The human reviews upstream and may refactor between sessions.** If a pull brings in
  substantial changes, summarize what landed before continuing — don't silently assume the
  prior state.
- **Build and verify before committing.** Run `npm run build:web` and confirm there are no
  errors.  A clean build is the minimum bar before a commit.
- **Match the file's existing style.** Decent frontend modules use `var`; server modules use
  `const`/`let`.  Don't introduce style inconsistencies as a side-effect of feature work.

## Token-efficiency tips

- Read only the file you need to change — avoid reading the whole bundle.
- The build step is fast; run it after every change, don't batch.
- `avatar-profile.js` — full profile card UI (edit form, banner, avatar crop, save).
- `avatar-image.js` — live avatar img rendering and per-author registry.
- `about.js` — `message_content` preview for `type:about` messages.
- `decent-ui.js` (plugin) — HTTP server, blob endpoints, git routes.
- `decent/src/style.css` — all CSS; search for the class name.
- `decent/src/modules/core/sbot.js` — all SSB RPC wrappers; add new API calls here.

## Security & Configuration Tips

- Never commit secrets, private keys, or real-world `~/.ssb` data. Use throwaway keys and
  caps in tests and examples.
- Be conservative with network- and replication-related changes; prefer opt-in configuration
  flags and document defaults clearly.
