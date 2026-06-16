# Work Order: ssbski Chat (DM) redesign — Bluesky-style conversations

**Status:** Ready for implementation
**Skin:** ssbski only (the Bluesky-style skin). Decent's plain `style.css` skin keeps the existing flat "Private" tab behaviour unless trivially shared.
**Intent:** Replace the current flat "all private messages in one reverse-chronological column" Chat tab with a real messenger: a conversation list (inbox) plus a per-conversation thread view with aligned chat bubbles, an inline bottom-anchored composer, a "new chat" recipient picker, and immediate (optimistic) rendering of sent/received messages. The target look is Bluesky's Messages screen.

> **Context for whoever picks this up cold:** `ssbc` is a SQLite-backed Secure Scuttlebutt (SSB) server with a WebSocket bridge. The browser frontend lives in `decent/src/` and is built into `decent/build/index.html` (a single inlined bundle). Two skins are served from the same bundle, distinguished only by which stylesheet is linked: **Decent** (`style.css`, port 8989) and **ssbski** (`ssbski-style.css`, port 8990). The DM feature is the same code for both skins today; this work order upgrades the **ssbski** experience.
>
> SSB private messages are ordinary feed messages whose `content` is encrypted (boxed) to a set of recipient feed ids (`recps`). The plaintext `content` — including the `recps` array itself — is only readable by those recipients. Identity in the browser is a client-side ed25519 keypair stored in `localStorage['decent/.ssb/secret']`; the browser signs messages itself and pushes them to the server via `sbot.add`. There is no server-side "logged-in user."

---

## 1. How to build, run, and test

### Build the frontend bundle
The bundle in `decent/build/` is **generated and not committed**. After any change under `decent/src/` you must rebuild:

```bash
npm run build:web
```

This runs `decent/scripts/style.js` (copies `decent/src/style.css` → `build/style.css`, `decent/src/ssbski-style.css` → `build/ssbski-style.css`, and regenerates `decent/src/style.css.json`) then browserifies `decent/src/main.js` into `decent/build/index.html` and post-processes it. **The page will not reflect source changes until you rebuild.**

### Run the server
```bash
node bin.js start          # starts sbot + Decent (8989) + ssbski (8990) + ws bridge (8008)
```
Then open `http://127.0.0.1:8990/` for ssbski. The Chat tab is at `http://127.0.0.1:8990/#private`.

> **Gotcha — start the local sbot early.** The browser UI is useless without the server; bring it up first (background it). See `memory/feedback_start_local_sbot.md`.
>
> **Gotcha — never run feed-mutating CLI commands against the live server.** Client CLI commands hit the running default server even with config overrides, which can write to the real feed. See `memory/project_cli_isolation_gotcha.md`. Do all functional testing through the browser identities described below.

### Test method: two burner identities, one server
You do **not** need two server instances. Each browser context generates its own keypair and signs client-side, so two isolated `localStorage` identities talking to the same server are two distinct SSB feeds sharing one message store. Private messages between them round-trip because both feeds live in the same DB.

To impersonate a burner in an automated browser (Playwright MCP was used to validate this work order), inject a keypair into `localStorage` and **hard-reload** (a hash-only navigation will not re-read `keys.id`, which is read once at module load):

```js
// In the page context:
localStorage['decent/.ssb/secret'] = JSON.stringify(KEYPAIR, null, 2)
location.reload()
```

Generate keypairs with the project's `ssb-keys` (it falls back to a JS sodium impl, which is fine for test keys):

```bash
node -e "const k=require('ssb-keys');console.log(JSON.stringify(k.generate()))"
```

Two burners used while authoring this order (reusable):

- **Burner A:** `@6aGOa+i1cKAC1ctM3/tsTYVBpqquktltfYKHBtJa3MU=.ed25519`
- **Burner B:** `@hV4UeIiHKeQ9yu9GPTysyke/lWIcCCVPUAtnd2Fj/cg=.ed25519`

Validation loop: inject Burner A → reload → open `#private` → start a chat to Burner B → send. Inject Burner B → reload → confirm receipt → reply. Inject Burner A → reload → confirm the reply appears in the same conversation.

> **Cleanup courtesy:** **save the existing `localStorage['decent/.ssb/secret']` (the full JSON, not just the id) before overwriting it**, and restore it when done. Burner DMs you publish during testing are encrypted and invisible to others, but SSB is append-only so they cannot be deleted from the store.

---

## 2. Architecture primer (read before touching code)

### Module system (depject / `combine`)
Each frontend file under `decent/src/modules/` is a plugin object: `{ needs, gives, create(api) }`. `create` returns an object whose keys are the capabilities it `gives`. Other modules consume those capabilities via `api.<name>` as declared in `needs`. Multiplicity matters:

- `'first'` — single implementation; `api.x(...)` calls the first registered one.
- `'map'` — many implementations; `api.x(...)` returns an array of each one's result.

UI modules are registered in `decent/src/modules/ui/index.js`. **A new module must be added to that index to be loaded.**

### Routing (`decent/src/modules/core/app.js`)
`getRoute()` reads `window.location.hash`:
- empty / `tabs` / `/` → `public`
- starts with `@` → profile, `%` → thread, `#` → message (these sigils are reserved)
- otherwise the raw hash string is the route (e.g. `private`, `friends`, `repos`, `channel/foo`).

`renderRoute(route)` calls `api.screen_view(route)` (multiplicity `'first'`); **each `screen_view` implementation returns a DOM node if it recognises the route, else `undefined`**, and the first non-undefined wins. So new screens are added by giving `screen_view` and matching a route prefix. The nav rail items, titles, and back-chevron logic also live in `app.js` (`navItems`, `labelForRoute`, `suffixForRoute`, `isRootRoute`). `isSsbski` is `!!document.querySelector('link[rel="stylesheet"][href*="ssbski-style.css"]')`.

> **Route naming for conversations:** do **not** use a route that starts with `@`, `%`, or `#` (reserved). Use a prefixed route such as `dm/@<feedid>` — `getRoute()` returns it verbatim and `screen_view` can parse the suffix. A canonical multi-recipient conversation id (see §6) can be hashed/encoded into the route.

### The sbot API surface (`decent/src/modules/core/sbot.js`)
Relevant capabilities the browser has:
- `sbot_log(opts)` — source stream over `sbot.createLogStream(opts)`; caches each message in `window.CACHE[key]`. Used by the current private screen.
- `sbot_messagesByType({type, reverse, limit, old, live})` — direct query against the SQLite store. **This is the reliable bulk-query path on this store.**
- `sbot_get(key, cb)`, `sbot_add(value, cb)`, `sbot_getLatest(feedId, cb)`, `sbot_publish(content, cb)`.

> **Critical store caveat:** this project's SQLite-backed store does **not** behave like classic flume for some streams. `sbot_query` returns empty and live log streaming is unreliable — `memory/project_data_layer.md` records "use `messagesByType`/`sbot_links` instead." This is the root cause of finding **B1** below (sent messages don't appear until reload). **Design for this:** do not rely on a live `createLogStream` to surface new messages. Use optimistic local append on send + an explicit re-query (and/or a short poll) to pick up the peer's messages.

### How a private message is created today
1. `message_compose` (`decent/src/modules/ui/compose.js`) builds the composer. On publish it parses the textarea, runs `ssb-mentions` over the text to populate `meta.mentions`, calls `opts.prepublish(meta)`, then `api.message_confirm(meta, cb)`.
2. The current Chat screen's `prepublish` (`decent/src/modules/ui/private.js:68-75`) sets `msg.recps = [selfId].concat(msg.mentions).filter(isFeed)` — i.e. **you address a DM by @mentioning the recipient inside the body.** Throws if no recipients.
3. `message_confirm` (`decent/src/modules/core/message-confirm.js`) shows a Preview→**Publish** lightbox, then calls `api.publish(content, cb)`.
4. `api.publish` → `sbot_publish` (`sbot.js:147-162`): **if `content.recps` is present it boxes the whole content (including `recps`) with `ssbKeys.box` before `sbot.publish`.** So `recps` travels *inside* the encrypted payload.
5. To read it back, `api.message_unbox` (`decent/src/modules/core/crypto.js`) runs `ssbKeys.unbox` with the local keys; on success it returns `{key, value:{…, content:<plaintext>, private:true}}`. **The plaintext `content.recps` is available after unbox** — this is what you group conversations by.

There is already a per-profile "Message privately" path you can mine for patterns: `decent/src/modules/ui/message-action.js` (`composeMessage`) opens a composer with `meta = {type:'post', recps:[selfId, id], private:true}` and a `prepublish` that canonicalises `recps`. **Reuse this recps-canonicalisation approach** rather than the mention-parsing approach.

### Rendering
`api.message_render(msg, opts)` (`decent/src/modules/ui/message.js`) builds the full feed post card (avatar, short author key, meta, content, reply/like/react buttons, and — under ssbski — the extra raw/save/share/more actions). The current Chat screen pipes the private stream straight into `message_render`, which is why DMs look like feed posts and carry like/bookmark/share. **The new thread view should render bubbles itself, not call `message_render`.** You still need message *content* rendering: `api.message_content(msg)` returns the rendered body (markdown, embeds) — use that inside a bubble.

The current private screen also `gives`:
- `message_meta` — appends recipient avatars to any private/encrypted message card.
- `message_content_mini` — returns `🔒` for an un-openable encrypted message (so foreign private messages in the public log render as a lock).

Keep both `gives` (other screens depend on them); only the `screen_view` and `builtin_tabs` parts are being redesigned.

---

## 3. Current behaviour (what exists today)

File: `decent/src/modules/ui/private.js` (the whole Chat tab is ~130 lines).

- `screen_view('private')` builds one `div.column.scroller` containing: a permanent `message_compose` (placeholder "Write a chat message"), then a single `content` column fed by **two** pull streams into `Scroller`:
  - `privateStream({old:false, limit:100})` — intended live tail (prepends, `top=true`).
  - `privateStream({reverse:true, limit:1000})` — history (appends).
  - `privateStream` maps every log message through `message_unbox` and keeps the ones that decrypt.
- Empty state: "No messages yet / Mention someone in a message to start a private conversation."
- Messages render via `api.message_render` (full feed cards), newest-first, **all conversations interleaved in one column**.

Screenshots captured during validation live in the repo root: `dm-01-empty-chat.png` … `dm-08-conversation-flat.png`. (These are scratch artifacts; delete them when the redesign lands.)

---

## 4. Findings to fix (bugs + UX)

**Bugs**

- **B1 — Sent/received messages do not render until a manual reload.** After Publish, the pane still says "No messages yet"; the message only appears after reloading the page. Same on the receiving side. Root cause: the live `createLogStream({old:false})` does not emit on this SQLite store (see §2 store caveat). **Fix by not depending on live log streaming** — optimistically append the just-sent message to the open thread, and re-query (`sbot_messagesByType`/`sbot_log` with `old:true`) on an interval or after send to pick up the peer.
- **B2 — Replying to a DM navigates out of chat.** The reply button in `message_render` dispatches `decent:reply` and sets `location.hash = '#' + msg.key`, landing you on the public **Thread** page with the public reply modal (`message.js:453-469`). The Chat composer is inline and does not listen for `decent:reply`. In the new thread view, answering must stay in the conversation (the bottom composer), never navigate to `%msgkey`.
- **B3 — Confirm modal on every send.** `message_confirm` forces a Preview→Publish step (`message-confirm.js`). Acceptable for a feed post; wrong for chat. In the thread view, send directly (skip `message_confirm`); keep optimistic UI + error toast on failure.

**UX gaps (the redesign)**

- **U1** No conversation list / inbox — all DMs are interleaved in one stream.
- **U2** You start a DM by @mentioning someone in the body — no recipient picker, no "New chat."
- **U3** Messages are full feed cards (avatar+handle+timestamp+like+bookmark+share+raw+more) instead of chat bubbles; no left/right alignment, no sender grouping, no read/sent state.
- **U4** Newest-on-top ordering; chat should read oldest→newest and anchor to the bottom.
- **U5** The right rail shows the generic "Active people" discover widget, unrelated to chat.

---

## 5. Target design (Bluesky Messages)

Two-pane layout inside the ssbski centre column (a mockup was produced and shown to the maintainer; reproduce that layout):

**Conversation list (left, ~215px):**
- Header "Messages" + a pencil/`edit` icon that opens the new-chat picker.
- One row per conversation: avatar, display name (fallback to short feed id), last-message preview (single line, ellipsised), relative timestamp, and an unread dot when applicable.
- Active conversation row is highlighted.

**Thread view (right):**
- Header: participant avatar + display name + short handle, and an options affordance.
- Message area: bubbles, **mine right-aligned in brand blue `#1185fe` with white text, theirs left-aligned in a neutral surface**; consecutive messages from the same author grouped (tighter spacing, one avatar/name per group); day dividers ("Today", date); **oldest→newest, scrolled to bottom, auto-scroll on new message**.
- A small "Sent ✓" affordance under your latest outgoing group is acceptable (there is no true read receipt in SSB — do not fake one beyond "sent").
- Bottom composer: a rounded single-line-growing input + a circular send button; **Enter sends**, Shift+Enter newlines. No Preview/Publish modal.

`#1185fe` is already the ssbski brand colour (and is Bluesky's blue), so this lands visually close to Bluesky with no new palette.

**Responsive:** on narrow widths, show the list OR the thread (not both) — list is the default, selecting a conversation pushes the thread; a back affordance returns to the list. Mirror the existing `feed-header__back` pattern from `app.js`.

---

## 6. Data model & core logic

**Conversation identity.** A private message's plaintext `content.recps` is an array of feed ids (always including the author and all recipients; self is included). Canonicalise:

```
participants(msg) = unique(content.recps mapped to string feed ids)        // includes self
conversationId    = participants.sort().join(',')                          // stable key
otherParticipants = participants without selfId                            // who you label the convo by
```

- 1:1 chat with X → `conversationId = sort([self, X]).join(',')`.
- Group chat → 3+ participants; label by the others (avatars + names, truncate).
- Note-to-self (recps === [self]) is possible; render as a "you" conversation. Low priority but don't crash on it.

**Building the inbox.** Stream all private messages once (use `sbot_messagesByType({type:'post', reverse:true, limit:...})` and/or `sbot_log`; unbox each with `api.message_unbox`; drop the ones that don't decrypt). Reduce into a map `conversationId → {participants, lastMsg, lastTs, unread}`. Sort conversations by `lastTs` desc. **Unread:** track a per-conversation "last seen" timestamp in `localStorage` (e.g. `ssbski:dm-seen` → `{conversationId: ts}`), mark unread when `lastTs > seenTs` and `lastMsg.author !== selfId`. Update seen-ts when the conversation is opened.

**Thread messages.** Filter the unboxed private messages to those whose `conversationId` matches the open conversation, sort by `value.timestamp` asc, render bubbles. `value.author === selfId` → outgoing (right/blue).

**Sending.** Reuse the boxing path — build `content = {type:'post', text, recps: participants, private:true}` and call `api.publish(content, cb)` (which boxes because `recps` is present). **Do not** go through `message_confirm`. On the callback:
- success → the optimistic bubble is confirmed (and/or replace with the real message once re-queried);
- error → mark the optimistic bubble failed + surface a retry.

Add the just-sent message to the thread immediately (optimistic) keyed by a temporary id; dedupe against the real message when it arrives from a re-query (match on author+timestamp+text or the returned key).

**New chat / recipient picker.** Reuse `suggest-box` + `api.suggest_mentions` (as `compose.js` does) for typeahead by name, and accept a pasted full feed id. On confirm, navigate to `dm/@<feedid>` (creating the conversation lazily — it exists as soon as the first message is sent). For groups, allow multiple recipients (stretch goal; 1:1 first).

---

## 7. Implementation plan (stages)

Land incrementally; each stage should build and run.

**Stage 0 — scaffolding.**
- Decide module layout. Recommended: keep `private.js` as the ssbski Chat owner but split helpers, or add `decent/src/modules/ui/chat.js` and register it in `ui/index.js`. Under ssbski, `chat.js`'s `screen_view` handles `private` (the inbox) and `dm/@…` (a thread); under Decent, fall through to the legacy behaviour. Keep `private.js`'s `message_meta` and `message_content_mini` gives intact.
- Add routes: ensure `app.js` `getRoute`/`suffixForRoute`/`isRootRoute` treat `private` as a root route (it already does) and give `dm/@…` a sensible title ("Chat") and a back chevron (not a root route).

**Stage 1 — conversation list (inbox).** Replaces `screen_view('private')` under ssbski. Build the reduce-into-conversations logic (§6), render the list, wire row click → `location.hash = 'dm/@<feedid>'` (or canonical id). Empty state: "No conversations yet — start one." This alone fixes U1 and most of the "feels like Patchwork" problem.

**Stage 2 — thread view.** `screen_view` matches `dm/@…`, resolves participants, renders the bubble thread (oldest→newest, grouped, day dividers, bottom-anchored), with the bottom composer. Wire send via `api.publish` with optimistic append (fixes B1, B3, U3, U4). Keep reply inside the view (fixes B2 — there is no separate reply button; replying is just sending in the open thread).

**Stage 3 — new chat.** Pencil icon in the list header → recipient picker (suggest-box + paste-id) → navigate to the thread. Fixes U2.

**Stage 4 — polish.** Unread dots + seen-ts; auto-scroll on new message; day dividers; "Sent ✓"; swap/hide the "Active people" rail while in chat (U5); responsive list/thread on narrow widths; focus management and a11y (the composer textarea autofocus, `aria-label`s, keyboard nav of the list).

**Stage 5 — live-ish updates.** Since live log streaming is unreliable (§2), add a lightweight refresh: re-query on a short interval (e.g. 3–5s) while a thread/list is open, plus immediately after send, and merge new messages (dedupe by key). Keep it cheap (bounded `limit`, only while the screen is mounted; tear down the interval on navigate-away).

---

## 8. CSS

- ssbski styles live in `decent/src/ssbski-style.css` (copied to `build/` by `scripts/style.js`; rebuild to apply). Add chat styles there, scoped so they only affect the ssbski skin.
- Reuse existing tokens/patterns where possible (the rail, `feed-header`, `feed-header__back`, avatar components). The brand blue is `#1185fe` (also the `themeColor` in `plugins/ssbski-ui.js`).
- Follow existing class-naming conventions (BEM-ish: `chat-list`, `chat-list__row`, `chat-thread`, `chat-bubble`, `chat-bubble--mine`, `chat-composer`, …).
- Do **not** put chat-specific CSS in `decent/src/style.css` (the Decent skin) unless intentionally shared.

---

## 9. Acceptance criteria

1. ssbski `#private` shows a **conversation list**, newest activity first, one row per participant-set, with avatar / name / last-message preview / time.
2. Selecting a conversation opens a **thread view** with bubbles: mine right/blue, theirs left/neutral, oldest→newest, scrolled to the latest message, grouped by sender with day dividers.
3. Sending from the thread composer **renders immediately** (no reload) and the message arrives for the recipient; **no Preview→Publish modal**; Enter sends, Shift+Enter newlines.
4. Replying never navigates to the public Thread (`%…`) page; it happens in the open conversation.
5. A **"New chat"** affordance starts a conversation via a recipient picker (typeahead by name + paste feed id).
6. Validated end-to-end with two burner identities (§1): A→B send, B receives and replies, A sees the reply in the same conversation — all without manual reloads beyond the identity-swap reloads inherent to the two-burner test harness.
7. `npm run build:web` succeeds; the Decent skin (8989) is unbroken (its private tab may keep the legacy behaviour).
8. No regression to `message_meta` / `message_content_mini` (foreign encrypted messages still show a lock in other views).

---

## 10. Risks & gotchas

- **Live streams are unreliable on this store** — the #1 trap. Don't build on `createLogStream({live:true})`; use query + optimistic + poll. (`memory/project_data_layer.md`.)
- **`keys.id` is read once at module load from `localStorage`.** Switching identity requires a full page reload, not a hash change — relevant only to the test harness, but it will bite you if you try to "log in as" someone without reloading.
- **The build is not committed.** Source edits are invisible until `npm run build:web`. Don't debug a stale bundle.
- **Never run feed-mutating CLI against the live server** (`memory/project_cli_isolation_gotcha.md`). Test through the browser.
- **`recps` lives inside the encrypted content**, so you can only group conversations among messages you can decrypt (which is exactly the ones you should see). Messages you can't unbox are other people's DMs — ignore them.
- **Boxing happens in `sbot_publish` only when `content.recps` is set.** If you build the content object yourself, include `recps` (array of feed-id strings) and `private:true`; do not pre-box.
- **Don't reuse `message_render` for bubbles** — it brings the whole feed-card action row (like/bookmark/share/raw/more) and the click-to-open-thread handler. Use `api.message_content(msg)` for the body only.
- **Scroller direction:** the existing `Scroller` (`decent/src/scroller.js`) supports top/bottom + sticky modes; for a bottom-anchored chat you likely want a simpler custom append + `scrollTop = scrollHeight` on new message rather than fighting the feed scroller. Either is fine if it meets criterion 2.

## 11. Non-goals (this work order)

- True read receipts / typing indicators / delivery state beyond "sent" (SSB has no primitive for these).
- Message editing or deletion (SSB feeds are append-only).
- Group-chat creation UI beyond what falls out naturally (1:1 first; multi-recipient is a stretch goal).
- Redesigning the Decent (`style.css`) skin's private tab.
- Changing the on-wire private-message format. This is a pure client/UI change; it reads and writes the same `{type:'post', text, recps, private:true}` boxed messages SSB clients already exchange.
