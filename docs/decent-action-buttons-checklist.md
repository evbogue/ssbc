# Decent Action Buttons UX Checklist

GitHub-style implementation checklist for upgrading Decent post actions: `Reply`, `Repost`, `Quote`, and `Reaction`.

## Goal

Make post actions:

- reliable from every screen
- clear in meaning
- navigable back to original/source posts
- expressive with a first-class emoji reaction system
- fast on the common path and rich when needed

## Phase 1: Action Reliability ✅

- [x] Audit `Reply`, `Repost`, `Quote`, and current `Like` behavior from:
  - public feed — Reply opens modal locally; Quote opens modal locally; Repost confirms directly ✓
  - profile feed — Reply/Quote fall back to thread/public via sessionStorage routing ✓
  - thread view — Reply opens modal locally; Quote opens modal locally via listenReplyEvents ✓
  - private view — Reply falls back to thread (thread.js reads recps for private context); Repost/Quote **blocked** (privacy fix) ✓
  - notifications — Reply/Quote fall back via sessionStorage routing ✓
  - channel views — Reply falls back to thread; Quote falls back to public (loses channel, known UX issue; Phase 3) ✓
- [x] Standardize `Reply` so it always opens a usable reply composer.
- [x] If no local composer is mounted, route to the thread view and auto-open reply there.
- [x] Standardize `Quote` so it always opens a usable quote composer.
- [x] If no local composer is mounted, route to the public composer and preload the quote there.
- [x] Ensure `Repost` works consistently from all screens and does not depend on local composer presence.
- [x] Remove dead custom-event paths or add fallbacks so buttons never silently do nothing.
- [x] Add manual verification notes for each screen/action pairing.

**Bugs fixed in this phase:**
- `repost.js`: Repost and Quote buttons are now hidden on private messages to prevent public exposure of private message keys/content.
- `thread.js`: Fixed `normalizeId()` calling `decodeURIComponent()` on raw SSB keys — base64 chars after the `%` sigil frequently form valid percent-encoded sequences, silently transforming ~12% of keys and preventing the reply composer from auto-opening. Now compares the raw `id` directly.

Files likely involved:

- [decent/modules_basic/message.js](/Users/evbogue/Code/ssbc/decent/modules_basic/message.js)
- [decent/modules_basic/repost.js](/Users/evbogue/Code/ssbc/decent/modules_basic/repost.js)
- [decent/modules_basic/compose.js](/Users/evbogue/Code/ssbc/decent/modules_basic/compose.js)
- [decent/modules_basic/thread.js](/Users/evbogue/Code/ssbc/decent/modules_basic/thread.js)
- [decent/modules_basic/public.js](/Users/evbogue/Code/ssbc/decent/modules_basic/public.js)

## Phase 2: Source Post Navigation

- [ ] Make repost embedded cards clickable to the original post/thread.
- [ ] Make quoted embedded cards clickable to the original post/thread.
- [ ] Preserve author/avatar links to author profile inside embedded cards.
- [ ] Keep outer repost/quote timestamps linking to the repost/quote message itself.
- [ ] Ensure clicking the embedded body is a large, forgiving target and not a tiny text-only link.

Files likely involved:

- [decent/modules_basic/repost.js](/Users/evbogue/Code/ssbc/decent/modules_basic/repost.js)
- [decent/modules_basic/post.js](/Users/evbogue/Code/ssbc/decent/modules_basic/post.js)

## Phase 3: Repost vs Quote UX

- [ ] Clarify the action model:
  - `Reply` = join this conversation
  - `Repost` = reshare as-is
  - `Quote` = reshare with commentary
- [ ] Make reposts feel lightweight and utility-oriented.
- [ ] Make quotes feel like “my post with attached context.”
- [ ] Add clearer embedded-card styling so reposted and quoted originals read as source material.
- [ ] Decide whether quote-without-commentary is allowed or should be nudged toward repost instead.
- [ ] Improve visual affordances so users understand which part opens the original post.

Files likely involved:

- [decent/modules_basic/repost.js](/Users/evbogue/Code/ssbc/decent/modules_basic/repost.js)
- [decent/modules_basic/post.js](/Users/evbogue/Code/ssbc/decent/modules_basic/post.js)
- [decent/style.css](/Users/evbogue/Code/ssbc/decent/style.css)

## Phase 4: Replace Like With Reactions ✅

- [x] Replace the current `Like` button with a reaction control.
- [x] Use actual emoji in the UI instead of icon-font or text-symbol stand-ins.
- [x] Set default quick reaction to `❤️`.
- [x] Pin `✌️` as the second quick reaction and treat it as traditional SSB “Dig”.
- [x] Keep the common path fast:
  - tap/click = send default reaction immediately
- [x] Provide a richer path:
  - expand affordance (`+` button) opens inline reaction tray (Phase 5 will add animation/gesture polish)
- [x] Include a `+` or picker affordance that opens the full emoji picker.
  - `+` reveals an inline tray: `😂 🔥 😮 👍 👎` (Phase 6 wires up the full picker behind it)
- [x] Define one-reaction-per-user-per-post behavior.
  - Uses timestamp comparison against `window.CACHE` to find the user's most-recent vote
- [x] Clicking the same reaction again removes it.
- [x] Picking a different reaction replaces the current one.

**Implementation notes:**
- Vote wire format unchanged (`type: 'vote'`, `vote.value`, `vote.expression`). Data model migration is Phase 7.
- Reaction counts are not deduplicated per user yet (multiple votes from one user all count). Phase 8 fixes this with proper aggregation.
- Legacy votes with `vote.expression: 'Like'` or old-format `c.vote: string` are rendered as `❤️` automatically.

Files likely involved:

- [decent/modules_basic/like.js](/Users/evbogue/Code/ssbc/decent/modules_basic/like.js)
- [decent/modules_basic/message.js](/Users/evbogue/Code/ssbc/decent/modules_basic/message.js)
- [decent/style.css](/Users/evbogue/Code/ssbc/decent/style.css)

## Phase 5: Reaction Tray UX ✅

- [x] Build a compact anchored reaction tray instead of opening a giant emoji wall first.
- [x] Start with a curated quick row:
  - `❤️` `✌️` `😂` `🔥` `😮` `😭` `👍` `👎`
  - `+` in the tray is reserved for Phase 6 full picker
- [x] Make the tray feel gesture-based, not form-based.
- [ ] Drag-across and release-to-select — deferred; requires pointer-capture API work.
- [x] Keep the tray anchored near the post action row.
  - `position: absolute; bottom: calc(100% + 8px)` anchored to `.reaction-group`
- [x] Ensure mobile and desktop both feel intentional:
  - mobile tap = default (❤️ or ✌️ in quick row)
  - mobile long-press (400 ms) = opens tray
  - desktop click = default (❤️ or ✌️ in quick row); `+` click also opens tray
  - desktop hover (300 ms hover-intent delay) = opens tray

**Animation:** spring cubic-bezier (0.34, 1.56, 0.64, 1) scale + opacity.
Tray is pointer-events:none when closed so it never blocks clicks beneath it.
Outside-click and Escape close the tray, listeners are added/removed per open cycle.

Files likely involved:

- [decent/modules_basic/like.js](/Users/evbogue/Code/ssbc/decent/modules_basic/like.js)
- [decent/style.css](/Users/evbogue/Code/ssbc/decent/style.css)

## Phase 6: Full Emoji Picker ✅

- [x] Add a full emoji picker behind the quick tray.
- [x] Add search.
- [x] Add “Recent” reactions.
- [x] Add sensible category grouping.
- [x] Prefer recents and likely/common reactions over dumping users into a giant default grid.
- [ ] Consider a “Common here” section later if community-specific usage data is available.

**Implementation notes:**
- Picker is accessed via the `···` button at the end of the tray pill.
- Search uses a keyword→emoji index; prefix matches rank above partial matches; category name used as a final fallback.
- “Recently used” section appears at the top when there is no query; powered by `localStorage` key `decent:recent-reactions`, max 16 entries.
- Six curated categories: Smileys, People, Nature, Food, Fun, Hearts — 20 emojis each.
- Picker is built lazily (once on first open) and stays in the DOM; recents and search reset on every open.
- Picker is `position: absolute` on `.reaction-group`, positioned just above the tray via JS (`trayEl.offsetHeight + 16px`).
- Two-level Escape: first press closes the picker (keeps tray visible); second press closes the tray.
- Selecting any emoji from the picker records it to recents, sends the reaction, and closes both picker and tray.
- Same spring cubic-bezier open/close animation as the tray (Phase 5).

## Phase 7: Reaction Data Model

- [ ] Decide how to represent reactions on the wire.
- [ ] Preferred long-term shape:

```js
{
  type: 'reaction',
  reaction: {
    link: '%msgid.sha256',
    emoji: '✌️'
  }
}
```

- [ ] Decide whether to:
  - keep `vote` for legacy `❤️`
  - add `reaction` for all emoji
  - or unify everything under `reaction`
- [ ] Preserve backward-compatible rendering for existing vote messages if needed.
- [ ] Normalize rendering so hearts and emoji reactions appear in one coherent reaction bar.

## Phase 8: Post-Level Reaction Rendering ✅

- [x] Render aggregated emoji chips directly on posts.
- [x] Example display:
  - `❤️ 3`
  - `✌️ 2`
  - `😂 1`
- [x] Highlight the current user’s active reaction.
- [x] Clicking a visible chip should apply or swap to that reaction.
- [x] Clicking your own active chip again should remove it.
- [ ] Consider a later hover/tap affordance to show who reacted with each emoji.

**Implementation notes:**
- Chips render in the post header row (`.message_meta`) alongside the timestamp — the existing plugin integration point.
- Per-author deduplication: only each user’s most-recent vote (by timestamp) counts, fixing the double-count bug noted in Phase 4.
- Chips are sorted by count descending (most popular emoji first).
- Current user’s active chip is styled with a pink border/background (`reaction-chip--active`).
- Clicking any chip sends a toggle vote (`value: 1` or `value: 0`). Private-message recps are preserved.
- Legacy `.action-liked-meta` class retained for any cached renders; no migration needed.

Files likely involved:

- [decent/modules_basic/like.js](/Users/evbogue/Code/ssbc/decent/modules_basic/like.js)
- [decent/style.css](/Users/evbogue/Code/ssbc/decent/style.css)

## Phase 9: Motion and Polish

- [ ] Add subtle spring or bloom motion when opening the quick tray.
- [ ] Slightly enlarge hovered/selected reaction in the tray.
- [ ] Add a crisp commit animation when a reaction is chosen.
- [ ] Avoid gimmicks like confetti or heavy motion.
- [ ] Keep the interaction fast, calm, and tactile.

## Phase 10: QA and Verification

- [ ] Add Playwright checks for:
  - reply from public feed
  - reply from profile feed
  - quote from public feed
  - quote from profile feed
  - repost publish flow
  - embedded source-post navigation
  - default reaction tap
  - quick tray open/select
  - reaction replace/remove
- [ ] Verify no browser console errors during normal action flows.
- [ ] Verify mobile-sized viewport behavior for the reaction tray and picker.
- [ ] Verify cache-busted CSS/JS is loading after UI changes.

## Acceptance Criteria

- [ ] All post actions work from all major screens.
- [ ] Reposts and quotes clearly preserve navigation back to the original post.
- [ ] Reply always opens a valid reply flow.
- [ ] Quote always opens a valid quote flow.
- [ ] Repost remains the fast reshare path.
- [ ] Reaction control supports immediate `❤️` and fast access to `✌️`.
- [ ] Reaction UI uses actual emoji.
- [ ] No dead-end embedded previews.
- [ ] No silent failures.
- [ ] No console errors during standard post-action usage.

## Open Product Decisions

- [ ] Decide whether quote-without-commentary should be allowed.
- [ ] Decide whether default quick reaction stays fixed as `❤️` forever or becomes adaptive later.
- [ ] Decide whether `✌️` should be explicitly labeled as `Dig` in the quick tray.
- [ ] Decide whether to expose a “who reacted” drilldown in the first release or defer it.

## Recommended Execution Order

- [ ] 1. Finish action reliability and fallback routing.
- [ ] 2. Make reposted and quoted originals clickable.
- [ ] 3. Improve repost vs quote rendering and visual clarity.
- [ ] 4. Replace like with a minimal reaction tray.
- [ ] 5. Add full emoji picker.
- [ ] 6. Add aggregation, polish, and deeper verification.
