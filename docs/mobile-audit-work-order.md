# Work Order: Follow-ups from the mobile layout audit

**Status:** Backlog — findings recorded, none of the items below are started.
**Scope:** Everything noticed while auditing ssbski/ssbpro at phone width that was *not* fixed in `f4e1c32`. Two buckets: things that are broken or risky (§1–§3), and surfaces nobody has actually looked at on a phone yet (§4).
**Type:** Mixed — one deploy-safety fix, a few UX/correctness items, some naming and dead-code debt, and a verification checklist.
**Intent:** `f4e1c32` fixed the layout defects visible on the Public feed and profile at 375px. It did not audit the rest of the app, and the deploy that shipped it exposed a build-script fault that briefly took the public node down. This work order is the honest remainder.

> **Context for whoever picks this up cold:** the browser frontend lives in `decent/src/`, is built into `decent/build/index.html` (one inlined bundle), and is re-skinned by CSS: `base.css` owns the shared component layer and defines no palette; `ssbski-style.css` (:8990), `ssbpro-style.css` (:8991) and `decent2-style.css` (:8992) each `@import` it and supply a `:root` palette plus skin-specific layout. The legacy `decent` skin (:8989, `style.css`) does **not** import `base.css` and is unaffected by anything here. Mobile rules for the shared layer live in `base.css` under `@media (max-width: 600px)`; ssbpro switches to its top-bar layout at 980px and decent2 at 880px, so those two skins need their own mobile blocks rather than inheriting ssbski's.

## What `f4e1c32` already fixed (baseline — don't re-report these)

Action rows fitting one line at 375px; reaction/share trays anchored to the action row instead of opening off-screen; git push cards giving the commit subject a full-width line; profile action buttons wrapping; feed padding under the floating compose button; compose-trigger placement re-evaluated on resize; compose modal showing its controls without waiting for a focus event; decent2's mobile FAB, top bar and action row; the profile relation/hints/activity panels moved from `ssbpro-style.css` to `base.css`.

## How to build, run, and verify

```bash
node bin.js start        # sbot + all UI ports + ws bridge
npm run build:web        # REQUIRED after any decent/src change — the page serves the built bundle
```

- Cache-bust when live-verifying: the browser HTTP-caches `index.html` and a service worker is registered. Append `?nocache=N`.
- **Check the bundle size after every build** until §1.1 is fixed: a healthy `decent/build/index.html` is ~3.2 MB. ~1 KB means the build failed and reported success.
- If you verify in the in-app Claude browser, take a screenshot *before* measuring geometry — a hidden pane reports `window.innerWidth === 0` and zero-height rects, which fakes both a stalled feed and a misplaced compose button.

---

## 1. Deploy safety (do this first)

### 1.1 `build:web` reports success when the bundle fails to build

`package.json:19` pipes browserify into indexhtmlify:

```
browserify decent/src/main.js | indexhtmlify --title "Decent SSB" > decent/build/index.html
```

If browserify errors, the pipeline's exit status comes from `indexhtmlify`, which succeeds on an empty stream and writes a ~1 KB `index.html` — valid HTML, empty `<script>`, no app. npm reports success and the deploy looks clean.

**This happened on 2026-08-15.** `/root/ssbc/node_modules` predated the `jsqr` dependency, browserify failed with `Can't walk dependency graph: Cannot find module 'jsqr'`, and the public node served an empty page for a minute or two before it was noticed.

**Fix:** run the pipeline under `set -o pipefail` (the script runs via `sh`, so this may need `bash -c`), or bundle to a temp file, check the exit code, then pipe. Additionally have `decent/scripts/postprocess-index.js` assert a minimum output size and exit non-zero with a clear message.

**Verify:** temporarily break a `require` in `decent/src/modules/core/app.js`; `npm run build:web` must exit non-zero and must not leave a truncated `index.html` in place. Revert the break.

### 1.2 The deploy procedure never installs server dependencies

README.md's "Deploying to a public node" is `git pull` → `npm run build:web` → restart. `git pull` does not update `node_modules`, so any dependency added since the last deploy makes the build fail — silently, per §1.1. Add `npm install` to the documented sequence, between the pull and the build.

### 1.3 `decent2.evbogue.com` is not served

`https://decent2.evbogue.com/` fails with an SSL error; the other three hostnames are fine. The reverse proxy (`/root/reverse-proxy` on the node) has no entry for it, so decent2 has no public URL even though it runs on :8992 locally. Infrastructure rather than repo, but it means decent2 can only be tested by SSH port-forward.

---

## 2. Correctness and UX

### 2.1 A single tap on the heart publishes a permanent vote

`decent/src/modules/ui/like.js:876-880` — the heart in the action row is built by `makeBtn(emoji, false)` and its `onclick` calls `reactAndClose(emoji)`, which publishes a `vote` message immediately. There is no confirmation and no undo beyond tapping again, which publishes a *second* message. Both are permanent, append-only, and replicate.

Compare the composer, which routes every post through `message_confirm`'s Publish/Cancel lightbox.

Two things make this sharper on a phone:

- The quick-reaction tray only opens on a **400ms long-press** (`like.js:941`) or a 300ms hover on a fine pointer (`like.js:932`). Neither is discoverable, so the tap-to-❤️ path is the only one most people will find.
- The action row is now a tight strip of ~29px buttons at 375px (a deliberate trade in `f4e1c32` — eight buttons have to fit ~300px), so the heart sits close to its neighbours.

This was hit accidentally during the audit: four stray `vote` messages are in the feed as a result, and they can't be removed.

**Worth deciding:** whether an accidental tap should be able to write to the feed at all. Options range from a brief undo affordance on the resulting mini card, to debouncing rapid toggles into a single net write, to leaving it as-is and simply making the tray discoverable. This is a product call, not a bug fix — flagging it, not prescribing it.

### 2.2 The feed cannot recover if the scroll container has no height when the stream starts

`decent/src/scroller.js` — the stream pauses itself at `queue.length > 5` and only a `scroll` event resumes it (`scroll()`, line 75). `isBottom()` (line 9) computes `topmax = scrollHeight - rect.height`; with a correct `rect.height` on a short feed this stays true, `add()` keeps firing from the drain, and the column fills normally. **In a normal browser this works** — the audit's apparent "feed stalls at 3 posts" was an artifact of a zero-height browser pane, and a speculative fix was written and then reverted.

The fragility is real even so: if `rect.height` is 0 when the stream starts — an app opened in a background tab, a cold PWA start, a `display:none` ancestor during boot — `isBottom()` reads false, the stream pauses, and a column that doesn't overflow can never produce the scroll event that would resume it. The feed stays half-empty with no recovery path short of navigating away and back.

**Fix (if pursued):** top up the column until it can actually scroll, resuming the stream and draining the queue, bounded by the stream ending. Note the queue can still hold items *after* the source has ended, so any pump must keep draining on `ended`, not bail on it.

**Verify:** boot the app in a background tab, then switch to it; the feed should fill without a manual scroll.

### 2.3 decent2 mobile gets `padding-bottom: 56px` for a tab bar it doesn't have

`base.css:3912` reserves 56px at the bottom of `.lightbox` for ssbski's bottom tab bar. ssbpro overrides `.lightbox` wholesale (`ssbpro-style.css:1128`); decent2 does not, so its modals sit 56px higher than they should on a phone. Cosmetic.

---

## 3. Naming and dead code

### 3.1 Two "ssbpro" names that mean "any network skin"

- `syncSsbproLeftStack` (`decent/src/modules/core/app.js:1097`) handles ssbpro *and* decent2.
- `isSsbproSkin()` (`decent/src/modules/ui/avatar-profile.js:30`) is literally `return require('../../skin').isNetwork()` — true for ssbski, ssbpro and decent2.

The second one caused a real bug: because the function reads as "is this ssbpro", the profile relation/hints/activity panels it gates were styled only in `ssbpro-style.css`, so on ssbski and decent2 they rendered as unstyled native buttons — light grey pills on a dark page. `f4e1c32` moved the CSS to `base.css`; the misleading names are still there and will mislead again. Rename to `isNetworkSkin()` / `syncLeftStack`.

### 3.2 The inline compose prompt is built for every feed and shown by no network skin

`decent/src/modules/ui/compose.js:448` (`if (opts.inline)`) builds a full prompt card — textarea, Browse and Preview buttons — and `base.css:705` hides it with `.compose-prompt { display: none }`. Confirmed live: the element exists with 5 descendant nodes and `display: none` on every feed render. Only the legacy `decent` skin styles it into view. Either drop the `inline` option for network skins or drop the rule; carrying both is dead DOM on three of four skins.

### 3.3 Console noise

- `deprecated api used: ssb-ref.parseInvite` logs on every page load, live and local.
- Service worker registration fails on the local ports (`An unknown error occurred when fetching the script`) but succeeds on the live HTTPS origins. Local-only, so it's a dev-environment annoyance rather than a shipped fault — but it means PWA behaviour can't be tested locally.

---

## 4. Not yet looked at on a phone

The audit covered the Public feed, Friends, Notifications (empty), and Profile, on ssbski and ssbpro, plus a pass over decent2. Everything below is **unverified at 375px** — not known-broken, just unexamined. decent2 in particular had no mobile rules at all before `f4e1c32`, which is a strong hint that its other surfaces have the same gap.

- Private / DM: inbox list, thread view, chat composer.
- Notifications with actual content in them.
- Keys, Channels/Groups, Repositories and the git browsing pages, Search results.
- The Connect/QR modal and the QR scanner, and the Themes modal (its preview iframes render whole skins at tile size).
- Profile edit, and the "Improve bio" panel.
- Posts containing images or blobs, and deeply nested reply threads.
- The legacy `decent` skin at :8989 — untouched by all of this, since it doesn't import `base.css`.

### Compose flow: the untested legs

The audit drove modal → typing → Browse/Preview → the preview card → Cancel, plus the reply path (the `re:` hint renders correctly). Not exercised:

- **Publish.** Deliberately not pressed — it appends a permanent public message. Test it against a burner sbot (see `memory/project_burner_sbot_recipe.md`) rather than the live feed.
- **Browse / file attach**, including the image blob path.
- The quote path, private/DM compose, and the `decent_quote_intent` auto-open path in `decent/src/modules/ui/public.js`.

---

## 5. Observed once, confirm before acting

- The compose FAB's focus ring appeared to render as a square rather than following the button's `border-radius: 50%`. Seen in a single screenshot on ssbski at 375px and not re-checked; confirm with keyboard focus in a real browser before changing anything.

---

## Success criteria

- A failed bundle build fails the command, and the documented deploy sequence installs dependencies first.
- A decision is recorded on §2.1 — either a change lands, or the current behaviour is deliberately kept and the tray is made discoverable.
- `isSsbproSkin` / `syncSsbproLeftStack` no longer say "ssbpro" when they mean "network skin".
- Every surface in §4 has been opened at 375px on all three network skins, with no horizontal overflow on `.column.scroller` and no element extending past the viewport.
