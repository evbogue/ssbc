# Work Order: Follow-ups from the mobile layout audit

**Status:** Backlog — the correctness items are done (see *Already resolved*); §1–§4 are open.
**Scope:** Everything noticed while auditing ssbski/ssbpro at phone width that is still outstanding. Two buckets: things that are broken or risky (§1–§2), and surfaces nobody has actually looked at on a phone yet (§3–§4).
**Type:** Mixed — one deploy-safety fix, some naming and dead-code debt, and a verification checklist.
**Intent:** `f4e1c32` fixed the layout defects visible on the Public feed and profile at 375px. It did not audit the rest of the app, and the deploy that shipped it exposed a build-script fault that briefly took the public node down. This work order is the honest remainder.

> **Context for whoever picks this up cold:** the browser frontend lives in `decent/src/`, is built into `decent/build/index.html` (one inlined bundle), and is re-skinned by CSS: `base.css` owns the shared component layer and defines no palette; `ssbski-style.css` (:8990), `ssbpro-style.css` (:8991) and `decent2-style.css` (:8992) each `@import` it and supply a `:root` palette plus skin-specific layout. The legacy `decent` skin (:8989, `style.css`) does **not** import `base.css` and is unaffected by anything here. Mobile rules for the shared layer live in `base.css` under `@media (max-width: 600px)`; ssbpro switches to its top-bar layout at 980px and decent2 at 880px, so those two skins need their own mobile blocks rather than inheriting ssbski's.

## Already resolved (baseline — don't re-report these)

**Fixed in `f4e1c32`:** action rows fitting one line at 375px; reaction/share trays anchored to the action row instead of opening off-screen; git push cards giving the commit subject a full-width line; profile action buttons wrapping; feed padding under the floating compose button; compose-trigger placement re-evaluated on resize; compose modal showing its controls without waiting for a focus event; decent2's mobile FAB, top bar and action row; the profile relation/hints/activity panels moved from `ssbpro-style.css` to `base.css`.

**Fixed in the follow-up:** the scroll column now recovers when it starts with no height — a `ResizeObserver` in `decent/src/scroller.js` re-runs the same check a scroll event would, once the box actually has a size. decent2's mobile lightbox no longer reserves 56px for a tab bar it doesn't have, and clears its fixed 52px top bar instead.

**Decision — tap-to-react stays as it is.** A single tap on the heart publishes a permanent `vote` message with no confirmation (`decent/src/modules/ui/like.js:876-880`), and toggling publishes a second one. This was reviewed and deliberately kept: tap-to-like matching Twitter/Bluesky is the expected interaction, and the cost is a couple of extra messages in an append-only log. Recorded here so it isn't raised again as a defect.

## How to build, run, and verify

```bash
node bin.js start        # sbot + all UI ports + ws bridge
npm run build:web        # REQUIRED after any decent/src change — the page serves the built bundle
```

- Cache-bust when live-verifying: the browser HTTP-caches `index.html` and a service worker is registered. Append `?nocache=N`.
- **Check the bundle size after every build** until §1.1 is fixed: a healthy `decent/build/index.html` is ~3.2 MB. ~1 KB means the build failed and reported success. The README deploy steps now include this check.
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

**Documented.** `git pull` does not update `node_modules`, so any dependency added since the last deploy makes the build fail — silently, per §1.1. The README's deploy sequence now runs `npm install` between the pull and the build, and checks the output size before restarting. Still worth doing §1.1 so the check isn't purely a habit.

### 1.3 `decent2.evbogue.com` is not served — **done**

Resolved on 2026-08-15. `decent2.evbogue.com` → `8992` in `/root/reverse-proxy/domains.json`, and the hostname was added to the one certificate the proxy loads. The orphaned `anproto.com` certbot lineage was folded into that same cert at the same time, which also fixed `try.anproto.com` and `presentation.anproto.com` — both had been failing TLS for the same reason decent2 was. Procedure is documented in README.md under "Adding a public hostname for a skin".

Two things surfaced while doing it, both now fixed but worth knowing:

- **`reverse-proxy.service` had been crash-looping for nine days.** A hand-started copy of the proxy held `:443`, so the unit could never bind. Because `serve.js` reads the certificate once at startup and certbot's deploy hook renews by restarting *the unit*, renewals were never reaching the process actually serving traffic. `:443` is now owned by systemd.
- **Wildcard certs were considered and declined.** `*.evbogue.com` needs DNS-01 validation and therefore a DNS provider API credential; Namecheap gates API access behind account criteria. Expanding the SAN list is the deliberate trade-off — see the README.

### 1.4 Four hostnames are in the cert but have no route

`www.wiredove.net`, `www.anproto.com`, `decent.anproto.com` and `ssb.anproto.com` have valid TLS but no `domains.json` entry, so the proxy answers 404. Pre-existing for the first two; the latter two came in with the folded `anproto.com` lineage. Decide what each should serve (the `www.` pair presumably mirrors its apex; the `*.anproto.com` pair probably belongs on `8989`) and add the entries, or drop them from the cert at the next expansion.

---

## 2. Naming and dead code

### 2.1 Two "ssbpro" names that mean "any network skin"

- `syncSsbproLeftStack` (`decent/src/modules/core/app.js:1097`) handles ssbpro *and* decent2.
- `isSsbproSkin()` (`decent/src/modules/ui/avatar-profile.js:30`) is literally `return require('../../skin').isNetwork()` — true for ssbski, ssbpro and decent2.

The second one caused a real bug: because the function reads as "is this ssbpro", the profile relation/hints/activity panels it gates were styled only in `ssbpro-style.css`, so on ssbski and decent2 they rendered as unstyled native buttons — light grey pills on a dark page. `f4e1c32` moved the CSS to `base.css`; the misleading names are still there and will mislead again. Rename to `isNetworkSkin()` / `syncLeftStack`.

### 2.2 The inline compose prompt is built for every feed and shown by no network skin

`decent/src/modules/ui/compose.js:448` (`if (opts.inline)`) builds a full prompt card — textarea, Browse and Preview buttons — and `base.css:705` hides it with `.compose-prompt { display: none }`. Confirmed live: the element exists with 5 descendant nodes and `display: none` on every feed render. Only the legacy `decent` skin styles it into view. Either drop the `inline` option for network skins or drop the rule; carrying both is dead DOM on three of four skins.

### 2.3 Console noise

- `deprecated api used: ssb-ref.parseInvite` logs on every page load, live and local.
- Service worker registration fails on the local ports (`An unknown error occurred when fetching the script`) but succeeds on the live HTTPS origins. Local-only, so it's a dev-environment annoyance rather than a shipped fault — but it means PWA behaviour can't be tested locally.

---

## 3. Not yet looked at on a phone

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

## 4. Observed once, confirm before acting

- The compose FAB's focus ring appeared to render as a square rather than following the button's `border-radius: 50%`. Seen in a single screenshot on ssbski at 375px and not re-checked; confirm with keyboard focus in a real browser before changing anything.

---

## Success criteria

- A failed bundle build fails the command (the deploy sequence already installs dependencies and checks the output size).
- `isSsbproSkin` / `syncSsbproLeftStack` no longer say "ssbpro" when they mean "network skin".
- Every surface in §3 has been opened at 375px on all three network skins, with no horizontal overflow on `.column.scroller` and no element extending past the viewport.
