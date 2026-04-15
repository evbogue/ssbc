# CLAUDE.md — ssbc / Decent

## What this is

A Secure Scuttlebutt (SSB) social client called **Decent**, running as a Node.js server
with a browser-based frontend.  The server (`bin.js`, `plugins/`) speaks the SSB protocol;
the frontend (`decent/`) is a browserified single-page app.

## How to run

```bash
node bin.js start          # starts SSB server + HTTP UI at http://127.0.0.1:8888
npm run build:web          # rebuilds decent/build/ (run after any frontend change)
                           # equivalent to: cd decent && npm run lite
```

The server must be running before the browser app can connect.

## Architecture in two sentences

The **backend** (`plugins/decent-ui.js`) serves static assets, proxies blobs via
`/blobs/add` and `/blobs/get/:hash`, and handles git-ssb HTTP requests.  The **frontend**
(`decent/index.js`) is a plugin system where each module declares `needs`/`gives` keys that
are wired together at startup — think dependency injection without a framework.

## Key directories

| Path | What lives there |
|---|---|
| `plugins/` | Server-side SSB plugins (decent-ui, git-server) |
| `decent/modules_core/` | Low-level plumbing: SSB connection, message confirm, blob URLs, screen routing |
| `decent/modules_basic/` | All UI components: avatar, feed, post, profile, follow, etc. |
| `decent/modules_extra/` | Optional/experimental modules |
| `decent/build/` | Generated — do not edit by hand |
| `decent/style.css` | All CSS (single file, no preprocessor) |
| `test/` | Node.js tap tests |

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

**Avatar image:** Spec recommends 512×512px; we crop to 512×512px. ✓
**Banner image:** We crop to 1600×534px (non-standard, no spec guidance).
**Blob link fields:** We include `link`, `size`, `type`, `width`, `height`, `name`. ✓

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

## Frontend plugin conventions

- Each module exports `needs`, `gives`, and `create(api)`.
- `'first'` means the first registered implementation wins; `'map'` means all run.
- After changing a module, rebuild with `npm run build:web`.
- The module system is in `decent/plugs.js` and wired in `decent/index.js`.

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

---

## Testing with Playwright MCP

```
mcp__playwright__browser_navigate  →  http://127.0.0.1:8888/
```

Use `browser_file_upload` to test avatar/banner photo uploads.
Use `browser_network_requests` with `filter: 'blobs'` to verify upload requests.
Kill stuck browser processes with `pkill -9 -f "ms-playwright"` if needed.

---

## Frontend plugin wiring — important details

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

All existing modules in `decent/modules_*` use old-style `var` and CommonJS.  Match the
surrounding style — do not introduce `const`/`let` or arrow functions into these files.

---

## Token-efficiency tips

- Read only the file you need to change — avoid reading the whole bundle.
- The build step is fast; run it after every change, don't batch.
- `avatar-profile.js` — full profile card UI (edit form, banner, avatar crop, save).
- `avatar-image.js` — live avatar img rendering and per-author registry.
- `about.js` — `message_content` preview for `type:about` messages.
- `decent-ui.js` (plugin) — HTTP server, blob endpoints, git routes.
- `decent/style.css` — all CSS; search for the class name.
- `decent/modules_core/sbot.js` — all SSB RPC wrappers; add new API calls here.
