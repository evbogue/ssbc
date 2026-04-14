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

## Phase 5: Reaction Tray UX

- [ ] Build a compact anchored reaction tray instead of opening a giant emoji wall first.
- [ ] Start with a curated quick row:
  - `❤️`
  - `✌️`
  - `😂`
  - `🔥`
  - `😮`
  - `😭`
  - `👍`
  - `👎`
  - `+` for full picker
- [ ] Make the tray feel gesture-based, not form-based.
- [ ] If feasible, support drag-across and release-to-select.
- [ ] Keep the tray anchored near the post action row.
- [ ] Ensure mobile and desktop both feel intentional:
  - mobile tap = default
  - mobile long-press = tray
  - desktop click = default
  - desktop hover/hold/expand = tray

Files likely involved:

- [decent/modules_basic/like.js](/Users/evbogue/Code/ssbc/decent/modules_basic/like.js)
- [decent/style.css](/Users/evbogue/Code/ssbc/decent/style.css)

## Phase 6: Full Emoji Picker

- [ ] Add a full emoji picker behind the quick tray.
- [ ] Add search.
- [ ] Add “Recent” reactions.
- [ ] Add sensible category grouping.
- [ ] Prefer recents and likely/common reactions over dumping users into a giant default grid.
- [ ] Consider a “Common here” section later if community-specific usage data is available.

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

## Phase 8: Post-Level Reaction Rendering

- [ ] Render aggregated emoji chips directly on posts.
- [ ] Example display:
  - `❤️ 3`
  - `✌️ 2`
  - `😂 1`
- [ ] Highlight the current user’s active reaction.
- [ ] Clicking a visible chip should apply or swap to that reaction.
- [ ] Clicking your own active chip again should remove it.
- [ ] Consider a later hover/tap affordance to show who reacted with each emoji.

Files likely involved:

- [decent/modules_basic/like.js](/Users/evbogue/Code/ssbc/decent/modules_basic/message.js)
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
