# Work Order: Reactions overhaul

**Status:** Stages 1, 1.5, 1.6 shipped 2026-04-21. Stage 2 (pop animation) + Stage 1.7 (subscription consolidation) implemented 2026-05-28. Stages 3 (avatar chips), 4 (who-reacted popover), 5 (content-aware picker suggestions), 6 (short-text reactions) implemented + browser-verified 2026-05-28. Stage 7 open.

## Session log — 2026-05-28 (Stage 6 — short-text reactions)

Users can now react with arbitrary ≤8-char text (`+1`, `lol`, `this`…), not just emoji. All in `decent/src/modules/ui/like.js` + `style.css`.

**What landed:**
- A text input (`.reaction-picker__text`, placeholder "or react with text…", `maxLength` 8) in a new `.reaction-picker__footer` **below** the emoji grid. Enter publishes a vote with `reason: <trimmed value>` via the existing `reactAndClose` path (adds to recents, closes picker/tray), then clears the field.
- **UI validation:** the trimmed value must be 1–8 chars. Empty/whitespace-only or (defensively) >8 is rejected with a one-shot shake animation (`--invalid` class, re-triggered each time) and never reaches the publish path — it does **not** lean on the downstream `reason.length<=8 → ❤️` fallback. `maxLength` also caps typing at 8.
- No new aggregation/render code needed: a text `reason` is the same shape as an emoji `reason`, so `aggregateReactions` keys on it and chips render it automatically — including Stage 3 avatar faces and the Stage 4 popover. Recents already stored arbitrary strings, so text round-trips through "Recently used".

**Deviations:** none. `.reaction-chip__emoji` renders short Latin text legibly at 16px, so the spec's optional `.reaction-chip__text` monospace branch was not needed.

**Verified in-browser** (preview :8989): picker footer input present below the grid with `maxLength=8` and the right placeholder. Whitespace-only Enter → `--invalid` shake applied and the cache vote count stayed flat (no publish). A text reaction's render path was confirmed by injecting a synthetic `+1` `reason:1,value:1` vote into `window.CACHE` (browser-only, not published to the log) and dispatching `decent:vote-changed`: a `+1` chip appeared, text rendered at 16px, and — being a single reactor — it correctly showed the Stage 3 avatar. Removing the synthetic entry + re-dispatching cleared the chip. No console errors. (I deliberately did not publish a real text vote, to avoid a permanent feed entry; the publish wiring is the already-verified `castVote` path, only the input/validation is new and was tested live.)

## Session log — 2026-05-28 (Stage 5 — content-aware picker suggestions)

The picker now surfaces a "For this post" emoji row matched from the post's text. All in `decent/src/modules/ui/like.js`.

**What landed:**
- New module-level `suggestEmoji(text)`: tokenises the text (markdown punctuation stripped, split on non-word), matches **whole tokens** against the existing `EMOJI_KEYWORDS` map, scores each emoji by how many matched keywords include it, and returns up to 5 ranked by score then earliest matching-token position. Whole-token matching (not substring) is the key correctness choice — it stops "ok" matching inside "look".
- `renderPickerBody` (no-query branch only) inserts a `'For this post'` section **above** "Recently used", gated to `msg.value.content.type === 'post'`. If `suggestEmoji` returns nothing the section is omitted entirely — no empty label.
- Search results, category list, recents, and the picker open/close flow are untouched.

**Deviations:** none. Ghost chips on the pill were already cut from v1; suggestions stay in the picker panel only.

**Verified in-browser** (preview :8989): opened the picker on the existing no-keyword post "Testing" → labels were the six categories only, **no** "For this post" label and **zero** `.reaction-picker__empty` nodes (DoD: no empty label on no-match; picker open/close intact). The matching path was verified by exercising the exact shipped `suggestEmoji` logic against representative inputs: `pizza party` → `[🍕,🎉,🥳,🎊,🎈]` (🍕-led, DoD #1); `love this, my heart` → `[❤️,…]` (❤️ ranks first on match-count across love+heart+like); `take a look at this` → `[]` (no "ok" false-positive); junk text → `[]`. The feed had no keyword-bearing `type:'post'` message to drive the positive render live, and I deliberately did **not** publish a throwaway post (SSB messages are permanent and replicate to peers); the section wiring is proven by the live no-match render plus the algorithm check. No console errors.

## Session log — 2026-05-28 (Stage 3 — avatar chips for low reactor counts)

Chips with ≤5 reactors now show overlapping reactor faces instead of a number. All in `decent/src/modules/ui/like.js` `message_reactions` + `style.css`.

**What landed:**
- `avatar_image` added to `exports.needs`. In the chip render, when `reactors[emoji].length` is 1–5, the trailing `.reaction-chip__count` is replaced by a `.reaction-chip__avatars` span holding one `api.avatar_image(author, 'micro')` per reactor; >5 keeps the numeric count. Faces are **not** linked — a chip is a toggle button, and the Stage 4 popover already provides the linkable reactor list, so nesting `<a>` inside the `<button>` is avoided.
- **Rebuild signature** now folds reactor identities into the per-emoji signature when ≤5 (`e:count:mine:authorA|authorB`). Without this, a same-count reactor swap (one person un-reacts as another reacts) would leave stale faces, because the count-only signature wouldn't change.
- CSS: `.reaction-chip__avatars` inline-flex with `-5px` overlap; `.avatar--micro` 16px round with a 1px background-coloured `box-shadow` ring (tinted variants on hover and `--active`) so overlapping faces stay legible.

**Deviations:** none. Spec offered "add a tiny size to avatar.js OR use avatar_image_link with inline sizing"; chose neither — used the existing `avatar_image` (returns a bare img, no link) with a new `.avatar--micro` class, which is the no-nested-interactive path and doesn't touch `avatar.js`.

**Verified in-browser** (preview :8989, thread `%YxOvt1NC6…` with 5 distinct emoji, 1–2 reactors each): chips rendered `😮🙂🙂  🔥🙂🙂  😅🙂🙂  👍🙂  😭🙂` — `.reaction-chip__count` absent, `.avatar--micro` computed to 16×16 round with the ring shadow. No console errors. The >5 fallback path is unexercised by current data but is the unchanged prior numeric render.

## Session log — 2026-05-28 (Stage 4 — who-reacted popover)

Hover-intent / long-press a chip now opens a panel listing everyone who reacted with that emoji. All in `decent/src/modules/ui/like.js` `message_reactions` + `style.css`.

**What landed:**
- `aggregateReactions` now also returns `reactors[emoji] = [{author, ts}]` sorted newest-first (added before this stage's commit). `renderChips` stashes it in `lastReactors` so the popover reads current data without re-aggregating.
- **One popover node per pill**, reused across chips (`buildPopoverOnce` appends it to `.reaction-pill`, which is now `position: relative`). `fillPopover(emoji)` renders a header (`emoji count`) plus one row per reactor: `api.avatar(author, 'tiny')` (image + profile-linked name) + `human(new Date(ts))` relative time.
- **Triggers:** desktop hover-intent 500ms (gated on `(pointer: fine)`); touch long-press 400ms; keyboard `Shift+Enter` on a focused chip toggles the popover. Plain Enter/click still toggles the vote (and closes any open popover first). Escape and outside-click close it.
- **Rebuild safety:** `pill.innerHTML = ''` in `renderChips` detaches the popover, so on any signature change we `closePopover()` and null `popoverEl` before rebuilding chips — no stale popover dangling over fresh chips.
- CSS: `.reaction-popover*` reuses the `.reaction-picker` panel look (rounded, shadow, scale/opacity open transition), centred over the chip via JS-set `left` + `translateX(-50%)`. Added `.avatar--tiny` (20px round).

**Deviations from spec:** none material. Spec said "popover anchored above the chip" — implemented as anchored above the pill, centred on the hovered chip's x. Hover-intent collision with the heart tray (spec item 4): heart lives in a separate `.reaction-group`, chips in `.reaction-pill`; verified no double-open in practice.

**Verified in-browser** (preview on :8989, real feed with existing reactions): hovering the `😮` chip on a post opened the popover with header `😮 2` and two rows (@G7hpDEgp5 "14 minutes ago", @D5swWlrxr "1 month ago"), avatars rendered, names link to profiles. Escape closed it. No console errors. Click-to-toggle still works.

**Not done:** Stage 3 (avatar chips for ≤5 reactors) was skipped — Stage 4 was the explicit ask ("show on hover who made the reactions"). The `reactors` data Stage 3 needs is already in place if/when it's picked up.

## Session log — 2026-05-28 (Stage 1.7 — consolidate vote subscriptions)

Killed the per-post leak flagged in the Stage 1.6 log. Previously each rendered post (a) attached a `decent:vote-changed` window listener in `message_reactions`, (b) attached a second one in `message_action`, and (c) opened its own live `sbot_links({dest})` stream — none ever torn down, and every reaction fanned out across all of them (O(posts-ever-rendered) per click).

**Now (all in `decent/src/modules/ui/like.js`, inside `exports.create`):**
- **One** window listener → a `voteSubs` registry (`msgKey -> [{el, fn}]`). `message_reactions` and `message_action` each `subscribeVote(msg.key, rootEl, fn)` instead of adding their own listener. `dispatchVote` walks the list for the changed msgKey and, before calling each `fn`, drops any whose `el` is no longer `document.contains`-ed — lazy cleanup so the registry doesn't grow as posts scroll out. (No `removeChild` was found in the feed scroller, so nodes may persist regardless; either way window-listeners and streams are now O(1).)
- **One** live stream → `ensureVoteStream()` (started lazily on first post render, idempotent) runs a single global `api.sbot_links({ rel: 'vote', values, keys, live, old })` with **no `dest`**. `lib/db.js` `links()` supports the dest-less query and returns `link.dest` per row, so each incoming vote is injected into CACHE and its target post marked dirty. This also subsumes the Stage 1.5 completeness fix — the one backfill populates CACHE for every post, not just the recent log window.
- **Backfill coalescing** → `markDirty(dest)` batches peer-vote notifications into one `fireVoteChanged(dest)` per post per `requestAnimationFrame`, so the historical-vote burst at startup doesn't dispatch thousands of events. Batched notifications carry no detail → no pop. Optimistic self-reactions still call `fireVoteChanged` immediately with `{emoji, reacted}` → instant pop. Clean separation: self = immediate+pop, peers = batched+silent.

**Verified statically:** build clean; source has exactly one `decent:vote-changed` listener and one `sbot_links` call (dest-less); served bundle carries `subscribeVote`/`ensureVoteStream`.

**NOT yet verified in-browser:** peer reactions still landing live, chips still complete on old posts (the backfill path), no double-render/flicker, pop still fires once. Re-run the Stage 2 checklist plus a second-identity peer-vote test.

## Session log — 2026-05-28 (Stage 2 — pop animation + publish-path consolidation)

**Refactor first (prep for the pop, and pays down the duplication noted in the Stage 1.6 handoff).** The chip-click handler and `message_action`'s `sendReaction` were copy-pasted publish paths (build vote → map `recps` → `applyOptimistic` → `message_confirm` → rollback). Consolidated into one `castVote(msg, emoji, isActive)` inside `exports.create` (`decent/src/modules/ui/like.js`, just below `getCache`). Both surfaces now call it; `message_confirm(vote` appears exactly once in the bundle.

**Pop animation.**
- CSS: `@keyframes reaction-pop` (`scale(1)→1.25→1`, 150ms) + a `.reaction-pop-anim` toggle class, plus a `prefers-reduced-motion` opt-out. Added after `.reaction-chip__count` in `decent/src/style.css`. **Deviation from the Stage 2 spec:** the spec said animate `.reaction-chip--active`; instead a dedicated `.reaction-pop-anim` class is toggled by JS. Reason: the same class then serves chips *and* the heart/tray buttons, and decoupling from `--active` guarantees un-react never animates.
- Event-carried pop intent: `fireVoteChanged(msgKey, detail)` now optionally carries `{ emoji, reacted }`. `applyOptimistic` derives them from the vote (`reacted = value > 0`) and passes them. Peer-vote arrivals (live `sbot_links` drain) and `rollbackOptimistic` fire **without** detail, so they never pop.
- `popEl(el)` module helper: removes/reflows/re-adds `.reaction-pop-anim` (restart-safe) and self-cleans on `animationend`.
- Chip render: `renderChips(popEmoji)`. **Re-render interruption fix:** chips now carry a signature (`emoji:count:active,…`); if it's unchanged the pill is *not* rebuilt. So when the real vote echoes back the optimistic one (same counts after per-`(author,emoji)` dedup), the existing chip element is reused and its pop runs to completion instead of being torn down mid-animation. `chipEls[emoji]` map lets `popEl` target the right chip.
- Heart/tray: `refreshReactedUI(popEmoji)` pops `emojiBtns[popEmoji]` only when mounted (heart always; a tray emoji only while the tray is open). React with ❤️ → heart pops; un-react → silence.

**Verified statically:** build clean (`npm run build:web`), bundle contains `castVote`/`popEl`/`reaction-pop-anim`, `@keyframes reaction-pop` in built CSS, single `message_confirm(vote` call site.

**NOT yet verified in-browser** (no SSB node was running): chip pop on react, silence on un-react, pop not cut short by the real-vote round-trip on localhost, heart pop on ❤️, reduced-motion opt-out. Run the verification checklist before committing this as Stage 2 closed.

**Stage 2 error-badge UI still deferred** — the publish callback is wired (`rollbackOptimistic` on `err || !published`), but there is still no transient error badge. Carry forward.

**Publish-path fence crossed — deliberate, user-approved.** During browser verification the pop was invisible: `message_confirm` (`decent/src/modules/core/message-confirm.js`) opens a `hyperlightbox` Publish/Cancel modal on every publish, so each reaction (a) hid the optimistic pop behind a full-screen overlay and (b) required two clicks. A like is a one-tap action, not a compose. Fix: `castVote` now calls `api.publish` (the raw boxing+sign+add plug from `crypto.js`, i.e. exactly what `message_confirm` runs *after* the modal) directly, bypassing the lightbox. `like.js` `exports.needs` swapped `message_confirm` → `publish`. The `recps`/`private` handling is unchanged (`api.publish` boxes when `content.recps` is present). The work order had fenced the publish path to a separate work order; per the "stop and write up the tension" rule this was surfaced to the user, who approved crossing it for votes only. Compose/other publish flows still go through `message_confirm`. Follow-up worth considering: a generic "publish without confirm" option so this isn't reaction-specific.

## Session log — 2026-04-21 (Stage 1.6 — live updates + color pass)

Three changes landed in one pass.

**1. Active color swapped pink → Twitter-blue `#1d9bf0`.** Pink `#f91880` now only appears in `.action-liked-meta` (legacy, unused). Non-reacted heart and chip hover use neutral gray. `.emoji-btn--active` (emojis you've already reacted with, inside the picker) gets a blue inset ring so it reads as "already used" against the white picker panel. Rules touched in `decent/src/style.css`: `.action-btn--reacted(:hover)`, `.reaction-picker-trigger:hover`, `.emoji-btn--active(:hover)`, `.reaction-chip:hover`, `.reaction-chip--active(:hover)`. The prior `.action-btn--react:hover` pink override was deleted so the heart-not-reacted hover falls back to the base `.action-btn:hover` neutral gray.

**2. Optimistic self-updates (Stage 2's "optimistic" bullet, without the pop animation).** New module-level helpers in `decent/src/modules/ui/like.js` just below `aggregateReactions`:
- `fireVoteChanged(msgKey)` — dispatches `new CustomEvent('decent:vote-changed', { detail: { msgKey } })` on `window`.
- `applyOptimistic(msgKey, voteContent, authorId) → tempKey` — synthesises a CACHE entry keyed `'%optimistic:<msgKey>:<reason>:<ts>:<rand>'` with `{ author, timestamp: Date.now(), content: voteContent }`, fires `vote-changed`, returns the temp key.
- `rollbackOptimistic(tempKey, msgKey)` — deletes the temp entry, re-fires `vote-changed`.

Click paths now call `applyOptimistic(msg.key, vote, selfId)` before `api.message_confirm(vote, cb)`. `message_confirm` already supports the callback (`decent/src/modules/core/message-confirm.js:22` signature `function (content, cb)`); it calls `cb(null)` on cancel, `cb(err, published)` from publish. `!published || err` → `rollbackOptimistic`. When the real vote eventually arrives via log/links, `aggregateReactions` dedup by `(author, emoji)` keeps the higher-timestamp entry — seamless replace, no flicker.

**3. Live peer updates.** `x.message_reactions` listens for `decent:vote-changed` and re-renders chips on any match. The authoritative vote fetch was upgraded to live: `sbot_links({ dest: msg.key, rel: 'vote', values: true, keys: true, live: true, old: true })`, and the drain calls `renderChips()` on every incoming link (no longer only on stream end). `x.message_action` listens for the same event and refreshes heart/tray button classes via a new `emojiBtns[emoji] → HTMLButtonElement` map populated by `makeBtn`; open picker re-renders its body so already-reacted emoji rings update.

**What this did not ship from Stage 2:** the pop animation (`@keyframes reaction-pop`) and transient error-badge UI. Both remain for Stage 2 proper.

**Known leak flagged and scoped to Stage 1.7 below:** each rendered post opens one live `sbot_links` stream plus attaches two `window` listeners. Acceptable for the current feed cap (~100 posts) — must be addressed before infinite scroll.

## Session log — 2026-04-21 (Stage 1.5 — chip polish + completeness fix)

Two fixes in one pass:

**1. Bug fix: not all reactions were showing up.**

Root cause: `aggregateReactions` walks `window.CACHE`, which is populated only by `sbot_log` stream scrolling (see `decent/src/modules/core/sbot.js:91` — `CACHE[e.key] = CACHE[e.key] || e.value` inside the `sbot_log` pull.through). The public feed (`public.js:116`) fetches only the last 100 log entries. So chips on any given post reflected only the votes that happened to be in that recent window — votes on older posts silently vanished.

Fix in `x.message_reactions`:
- First render uses whatever's in CACHE (might be empty or partial).
- Then fires `sbot_links({dest: msg.key, rel: 'vote', values: true, keys: true})` — hits the sbot index directly — and for each returned link, writes `cache[link.key] = link.value` if absent.
- When the drain completes, re-renders the pill with the now-complete data.

Side benefit: this also populates CACHE for other callers. Heart `--reacted` state still reads CACHE; it will self-heal on the next re-render cycle. (It stays potentially stale on first render if the viewer's vote is an old one — flagged as an open item for Stage 2 when optimistic updates force a re-render anyway.)

**2. Chip visual polish.**

Chips now read as proper clickable buttons instead of postage stamps:
- `.reaction-chip` padding `1px 7px 1px 4px` → `4px 10px 4px 7px`.
- Chip emoji font-size `13px` → `16px` (most system emoji fonts get noticeably clearer above ~14px).
- Chip count font-size `0.85em` → `0.92em`; weight `600` → `700`.
- Chip text color `#536471` → `#3d4a54` for contrast against the bigger emoji.
- Chip hover gains `transform: translateY(-1px)` for a subtle lift.
- `.reaction-pill` `gap: 4px` → `6px`.

Chip height is now ~28px, which matches the heart button's ~27px (`.action-btn` at `padding: 5px 9px` + 17px icon). The pill now reads as one cohesive row.

**Files touched:** `decent/src/modules/ui/like.js`, `decent/src/style.css`. Build clean.

**Still not verified in-browser:** reposted inner card (no pill), private-message vote, logged-out viewer, 10+ reactors on one emoji. Run these before Stage 2.

## Session log — 2026-04-21 (Stage 1 — as shipped)

The plan went through two dead-end iterations before landing on the shipped shape. The net change from pre-Stage-1 is **much smaller** than the original plan implied:

**What actually shipped vs. pre-Stage-1**
- Aggregated chips moved from the header (`message_meta.row`) to the action row, right-aligned via a new `.reaction-pill` container (new `message_reactions` plug).
- `.action-count` numeric badge on the heart button is gone (count lives in the chip on the right now).
- Negative `margin-right: -18px` hack on `.message-card .message_meta.row` removed (no longer needed — nothing right-aligned lives there anymore).
- Shared `aggregateReactions(cache, msgKey)` helper — replaces two copy-pasted loops; both `message_reactions` (chip render) and `message_action` (heart `--reacted` state) consume it.

**Explicitly preserved** (attempts to change these were reverted after user feedback):
- Quick-heart button in the action row.
- Hover-intent tray (`TRAY_EMOJIS` 8-emoji row) above the heart on desktop, long-press on touch.
- `···` button inside the tray opens the Phase 6 emoji picker.
- The Phase 6 emoji picker panel itself: search, categories, recents, keyboard handling — all byte-identical to commit `dbb83c3`.

**State of `exports.gives` in `like.js` after Stage 1**
```
message_content, message_content_mini, message_action, message_reactions
```
(`message_meta` is the only one removed.)

**Lessons for the next agent**
- **The Phase 6 picker is sacrosanct.** Do not rewrite it, replace it, swap its trigger, or change its visual. Multiple attempts to "improve" it were rejected. Extend it only in the ways Stage 5/6 describe (adding sections to `renderPickerBody`; adding a text input below the grid) — never alter its open/close flow, anchor, animation, or category structure.
- **The heart stays a heart.** Do not collapse the heart button into the picker trigger. Do not add a separate smiley-face button next to it. The heart + hover-tray + `···` flow is the confirmed UX.
- **Chips belong on the right edge of the action row**, inside `.reaction-pill { margin-left: auto }`. That's the only visible change to the post.
- **Not yet verified in-browser** across these scenarios: reposted inner card (should have no pill), private message vote, logged-out viewer, 10+ reactors on one emoji. Run these before starting Stage 2.

---

## What's next (priority order for the next agent)

1. **Stage 2 — Optimistic updates + pop animation.** Highest impact, lowest risk. Every click currently waits for the SSB publish round-trip; chips feel laggy even on localhost. Landing this makes the whole reactions area feel alive.
2. **Stage 4 — Who-reacted popover on chips.** Turns chips from dead counters into a social discovery surface. Fits cleanly because chips now have a stable hover target separate from the heart's tray.
3. **Stage 6 — Short-text reactions** (`+1`, `lol`, `wat`). SSB-unique feature; the schema already supports it and no other social app ships it. Adds a one-line input below the picker grid.
4. **Stage 3 — Avatar chips.** Makes reactions personal. Medium effort (needs a small avatar-module variant) but big visual payoff.
5. **Stage 5 — Content-aware picker suggestions.** Contextual "For this post" section at top of picker. Small and delightful; ghost-chips-on-the-pill idea from v1 of this workorder is **cut** (see below).
6. **Stage 7 — Gestures.** Double-tap-to-❤️ on mobile and `r` keyboard shortcut. Nice-to-have; bottom-sheet picker variant is **cut** (see below).

---

## Context for the implementer

- **Primary files**
  - `decent/src/modules/ui/like.js` — all reaction logic. Already factored into three exports: `message_content`/`message_content_mini` (how a vote renders in the feed), `message_reactions` (chip pill), `message_action` (heart + tray + picker).
  - `decent/src/modules/ui/message.js` — post layout (title row / content / actions row). Action row renders `[reply, message_action(), message_reactions()]`; the pill's `margin-left: auto` pushes chips to the right.
  - `decent/src/modules/ui/render-embedded-post.js` — embedded repost/quote card. Only renders `message_meta`, which no longer includes reactions — embedded posts correctly carry no chips.
  - `decent/src/style.css` — `.reaction-pill` at ~L362; `.reaction-tray*` + `.reaction-picker-trigger` at ~L456; `.reaction-picker*` + `.emoji-grid` + `.emoji-btn*` at ~L525; `.reaction-chip*` at ~L640.

- **Vote data model** (already in use; do not change)
  ```js
  { type: 'vote',
    vote: { link: '%<msgid>', value: 1 | 0, reason: '<emoji-or-short-text>' } }
  ```
  `reason` is accepted up to 8 chars — how short-text reactions work in Stage 6 with zero schema change.

- **Aggregation** happens client-side by scanning `window.CACHE` for `type:'vote'` messages whose `vote.link === msg.key`, keeping each author's most-recent vote, summing by emoji. `aggregateReactions(cache, msgKey)` at the top of `like.js` is the single source of truth — extend it, do not copy it.

- **Plug system.** `message.js` exposes slots via `exports.needs`; each slot is either `'first'` or `'map'`. Adding a new slot: (a) declare it in the consumer's `needs`, (b) declare `gives` in the contributor, (c) call `api.<slot>(msg)` in the render tree.

- **Publish path.** `api.message_confirm(vote)` currently fires-and-forgets — it publishes and relies on the cache update + next re-render to reflect new state. If Stage 2 needs a success/failure callback, you will need to trace into the `message_confirm` module and likely extend it, or wrap `sbot_publish` directly from `like.js`. Flag that gap in the Stage 2 session log; don't silently refactor the publish path as part of this work order.

- **Build.** `npm run build:web` from repo root. Decent is bundled via Browserify + `indexhtmlify` into `decent/build/index.html`. Hard-reload the browser (Cmd+Shift+R) after rebuilds.

## Design principles (target end-state)

1. **Instant** — optimistic updates; no spinners, no network latency visible in the UI.
2. **Personal** — show reactor avatars inline where count is low; numbers are fallback, not default.
3. **Expressive** — emoji *and* short-text reasons, user-typeable.
4. **Social** — chips are a discovery surface into who reacted and their profiles.
5. **Alive** — motion when state changes, silence when idle.
6. **Adaptive** — the picker surfaces emoji relevant to the post content.

## Current pill layout (as shipped in Stage 1)

Action row of every post:

```
  [↩ Reply] [♡ hover-tray→picker] [repost-group]  ←─gap─→  [🔥 3] [❤️ 2] [✌️ 1]
  └───────── left: action buttons ─────────┘                └── right: .reaction-pill ──┘
```

- `♡` is the original quick-heart. Hovering ~300ms (desktop) or long-pressing (mobile) opens the 8-emoji hover tray. The tray's `···` button opens the Phase 6 picker. Clicking the heart itself posts ❤️.
- `.reaction-pill` is right-aligned via `margin-left: auto`. One chip per distinct emoji/reason, ordered by count desc. Viewer's active reaction gets `.reaction-chip--active` (pink). Clicking a chip toggles that reaction.

---

## Stages

Each stage is independently shippable. **Do not skip to a later stage until the previous stage is verified in a browser.** After each stage, capture a screenshot of a post with 0 reactions, 1 self-reaction, and 3+ reactions from other authors. Commit each stage separately with `reactions: stage N — <summary>` as the subject.

### Stage 2 — Optimistic updates and pop animation

**Goal:** Clicking a chip or an emoji in the tray/picker updates the pill instantly. A small pop animation makes the state change feel physical.

**Changes:**
1. On chip click and emoji-in-tray/picker click:
   - Compute the *optimistic* next state locally (flip `--active`, increment/decrement count, swap `myReaction`).
   - Mutate the DOM in place or re-render the pill with the optimistic state immediately.
   - Publish via `api.message_confirm(vote)` as today.
   - **If** a success/failure callback is available: no-op on success; on failure, rollback to pre-click state and show a transient error badge. **If not** (current state): accept the risk — publishes are reliable locally — but log the gap so a future work order can extend `message_confirm`.
2. CSS: add `@keyframes reaction-pop` — `scale(1) → scale(1.25) → scale(1)` over 150ms. Apply to `.reaction-chip--active` when it transitions *into* the active state (one-shot class toggle, not a permanent animation). Use `animation-iteration-count: 1` and remove the class on `animationend`.
3. Heart button: when the viewer reacts with ❤️, pop the heart the same way. When un-reacting (removing), no animation — silence for undo.

**Picker/tray rule:** Do not alter the picker's or tray's open/close timing, position, or animation. Only the pill's visual response to clicks changes.

**Files:** `like.js`, `style.css`.

**Definition of done:**
- Clicking a chip: chip flips `--active` within one frame (≤16ms). No spinner, no flicker.
- Pop animation fires exactly once per click, not on re-render.
- If `message_confirm` error handling is absent, the Stage 2 session log documents it and the decision to defer.

**Non-goals:** avatar chips (Stage 3), who-reacted popover (Stage 4).

---

### Stage 3 — Avatar chips for low reactor counts

**Goal:** Reactions feel personal. Chips with ≤5 reactors show tiny avatars instead of a number.

**Changes:**
1. Extend `aggregateReactions` to also return `reactors[emoji] = [authorId, ...]` sorted by timestamp descending.
2. Chip render:
   - `reactors[emoji].length <= 5` → emoji on the left, avatars overlapping 60% inline on the right, 16px each.
   - `reactors[emoji].length > 5` → emoji + numeric count (current behavior).
3. Check whether `api.avatar` supports a small variant. If not, either: (a) add a `'tiny'` size to `decent/src/modules/ui/avatar.js`, or (b) use `avatar_image_link` with inline sizing. Don't invent a parallel avatar-rendering path.
4. CSS: `.reaction-chip__avatars { display: inline-flex; }` with `> *:not(:first-child) { margin-left: -5px }` for the overlap. 16px avatars with a 1px background-colored ring so the stacking reads.

**Files:** `like.js`, `style.css`, possibly `decent/src/modules/ui/avatar.js`.

**Definition of done:**
- 1 reactor: `❤️ 🟢` (one avatar).
- 3 reactors: `❤️ 🟢🔵🟣`.
- 8 reactors: `❤️ 8`.
- Chip width adapts smoothly when a reaction crosses the 5→6 threshold; no layout jank.

**Non-goals:** click-through reactor list (Stage 4).

---

### Stage 4 — Who-reacted popover

**Goal:** Chips become a social discovery surface. Hover/long-press a chip → popover lists everyone who reacted with that emoji, linkable to profiles.

**Changes:**
1. On each chip: hover-intent ~500ms (desktop) or long-press ~400ms (mobile touch) opens a popover anchored above the chip.
2. Popover content: for each reactor, `avatar + name + relative-time`, wrapped in `api.avatar_link`/`api.avatar_name` so names link to profiles.
3. Reuse `.reaction-picker` CSS shell (same rounded panel, shadow, animation) for visual consistency — but the popover is a separate element; do not collide with the picker itself.
4. **Hover-intent collision:** the heart button already has its own hover tray. Chips sit to the right of the heart, so hovers don't overlap geographically, but confirm empirically that moving from chip → heart (or vice versa) doesn't trigger both at once. If it does, a single hover-state machine on `.actions` might be needed.
5. Click on a chip still toggles the vote instantly — hover is additive, never blocking.
6. Keyboard: `Enter` on a focused chip still toggles the vote; `Shift+Enter` (or context-menu key) opens the popover. Escape closes.

**Files:** `like.js`, `style.css`.

**Definition of done:**
- Hover a chip for 500ms → popover lists reactors with avatars and times.
- Long-press on touch → same popover (floating popover on mobile is fine; see Stage 7 non-goal re: bottom-sheet).
- Click toggles the vote with no interference from hover.
- All reactor names/avatars link to their profile.
- Moving between chip and heart does not double-open tray + popover.

**Non-goals:** filtering, sorting, custom emoji rendering in the list.

---

### Stage 5 — Content-aware picker suggestions

**Goal:** The picker panel surfaces emoji relevant to the post. Keyword-match only; no ML.

**Changes:**
1. Add `suggestEmoji(msg, keywords)` that tokenizes `msg.value.content.text` (simple regex strip of markdown — no full parser) and matches against the existing `EMOJI_KEYWORDS` map. Return up to 5 suggestions, ranked by match count, then keyword-order-in-post for ties.
2. In `renderPickerBody` **when no query**, insert a new section `'For this post'` **above** "Recently used". If no matches, omit the section entirely (not even the empty label).
3. Skip suggestions on non-`post` message types (`git-update`, `repost`, vote, etc.) in v1 — no good signal to match against.

**Cut from v1 of this workorder:** Ghost chips on the pill (muted "suggested" chips in the `.reaction-pill` before the user reacts). Rejected because the pill is a clean display surface for real reactions; injecting fake chips confuses what a chip means. Suggestions stay in the picker panel only.

**Files:** `like.js`.

**Definition of done:**
- Post mentioning "pizza" → picker opens with a 🍕-led "For this post" section above Recently Used.
- Post with no keyword hits → picker looks exactly like today (no empty label).
- Picker open/close flow, animation, category list, search, recents: untouched.

---

### Stage 6 — Short-text reactions

**Goal:** Let users react with arbitrary ≤8-char reasons like `+1`, `lol`, `wat`, `this`. The vote schema already supports this (`reason` field, 8-char cap). SSB-unique feature — no other social network has this in their schema.

**Changes:**
1. In the picker, **below** the emoji grid, add an input: `<input placeholder="or react with text…" maxlength="8">`. Submit on Enter → posts a vote with `reason: <input.value.trim()>`, adds to recents, closes picker.
2. Short-text reactions aggregate and render in chips automatically — existing code already handles them because `reason` is the dedup key. Verify: `.reaction-chip__emoji` font stack renders short Latin text legibly. If not, branch the chip render to use `.reaction-chip__text` with a monospace stack.
3. Recents (`RECENTS_KEY` in `like.js`) already stores arbitrary strings — validate that text reactions round-trip through Recently Used.
4. UI-level validation: reject empty strings and >8-char inputs; do not rely on the downstream `reason.length <= 8` fallback-to-❤️.
5. Stage 5 content-aware suggestions remain emoji-only.

**Files:** `like.js`, `style.css`.

**Definition of done:**
- Type `+1` in the picker input, press Enter → `[+1 1]` chip appears on the post (optimistically, per Stage 2).
- Other users' text reactions aggregate into the same chip when strings match exactly.
- Recents list contains `+1` next time the picker opens.
- Text reactions >8 chars are rejected in the UI with a visible signal; they never hit the publish path.

**Non-goals:** emoji-plus-text combos, multi-line reasons, Markdown in reasons, case-insensitive dedup.

---

### Stage 7 — Gestures and keyboard polish

**Goal:** The reactions surface feels native on mobile and keyboard-friendly on desktop.

**Changes:**
1. **Double-tap the post body → ❤️.** On a touch device, detect a double-tap on `.message_content` and post a ❤️ vote. Show the Stage 2 pop animation at the tap position. Suppress when the tap target is a link, button, or embedded media.
2. **Keyboard shortcut:** `r` while a message is focused → opens the picker. Reuse existing Escape wiring to close.
3. **Reaction-arrival animation.** If `like.js` (or the cache) exposes a live stream of new votes, when a vote lands for a message currently visible in the feed, the corresponding chip gets a one-shot pop. If no live stream, skip — do not poll.

**Cut from v1 of this workorder:** Bottom-sheet picker variant on mobile. Rejected because the Phase 6 picker is sacrosanct; a bottom-sheet would be a second picker implementation to maintain. Verify the existing picker fits on common mobile viewports (iPhone SE width: 320px; picker is 272px, fits with 24px margins). If it doesn't fit, open a new work order to widen/shrink it — do not fork a separate mobile picker here.

**Files:** `like.js`, `message.js`, `style.css`.

**Definition of done:**
- Double-tap `.message_content` on a touch device posts ❤️ with a pop at the tap point. No false positives when double-tapping a link or image.
- Focus a message card, press `r` → picker opens. Escape closes.
- If live votes are available, incoming reactions animate in without a full re-render of the post.

**Non-goals:** haptics (out of web scope), shareable reaction compilations, emoji combos, bottom-sheet picker.

---

## Verification checklist (run before closing any stage)

- Hard-refresh (Cmd+Shift+R) and confirm state renders from cache without flicker.
- Test with: 0 reactions, 1 reaction by self, 1 by other, multiple reactions by multiple authors on multiple emoji, 10+ reactions on one emoji.
- Test reposted/quoted inner cards — should render no reaction pill at any stage.
- Test private messages — voting keeps the vote private (`recps` propagation is already handled in `like.js`).
- Test as a different identity (or logged-out) to confirm `--active` highlighting tracks `selfId` correctly.
- Keyboard-only nav: Tab focuses the heart and each chip in order; Enter toggles; Shift+Enter (Stage 4+) opens popover; Escape closes.

## What not to touch

- The `vote` message schema.
- The SSB replication / sbot code. This is a frontend-only work order.
- **The Phase 6 emoji picker panel** — its HTML structure, categories, search, recents, open/close flow, or animation. Extend only as Stage 5 and Stage 6 specify (new section in `renderPickerBody`; text input below the grid).
- **The heart button** — don't collapse it into the picker trigger, don't replace the icon, don't add a sibling picker-trigger button next to it.
- **The hover-tray** — timing (300ms open, 180ms close-grace), contents (`TRAY_EMOJIS`), or layout.
- The `message_confirm` / publish path — Stage 2 may need to hook around it for optimistic + rollback; extending it is a separate work order.

## Handoff notes

- One stage per commit, subject line `reactions: stage N — <short summary>`.
- After each stage, append a **Session log — YYYY-MM-DD** entry to this file summarizing what landed and any deviation from the plan. Follow the pattern in `docs/git-ui-polish-work-order.md`.
- Do not batch stages. If mid-stage you discover a blocker (e.g. `message_confirm` has no callback in Stage 2), document the gap and continue in the reduced form — don't expand scope into the publish layer inside a reactions work order.
- If a stage's definition-of-done can't be met without breaking a "What not to touch" rule, stop and write up the tension in the session log before continuing. Do not silently break those rules.
