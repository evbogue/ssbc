# Work Order: One app, one vocabulary, three live-switchable skins

**Status:** Ready for implementation — decisions resolved below.
**Scope:** Collapse the four separate skin "apps" into **one app** with a runtime **Themes** picker. Unify the vocabulary on **ssb-default lingo**. Reduce to **three pure-CSS skins**: `decent2`, `ssbpro`, `ssbski`. Retire the legacy single-column `decent` skin.
**Type:** Convergence refactor. Net effect: delete ~50 skin-conditional JS branches, replace with a single skin accessor + one lexicon; make skins 100% CSS so they can be swapped live.
**Intent:** Today the "skins" are deployed as separate ports/PWAs and differ in three ways — CSS, **vocabulary** (Subscribe vs Follow, Groups vs Channels, Feed/Discover vs Public), and a handful of **JS-built DOM/feature** differences. This work order makes the components, words, and feature set identical across skins, leaving only CSS to vary. Once that's true, switching skin is just: set `data-skin` on `<html>` + swap the `<link>` href — **live, no reload, no rebuild.**

> **Context for whoever picks this up cold:** `ssbc` is a SQLite-backed Secure Scuttlebutt (SSB) server with a WebSocket bridge. The browser frontend lives in `decent/src/` and is built into `decent/build/index.html` (one inlined bundle). All skins **already share that one bundle** — each is just a different stylesheet the UI server links into the served HTML, served by a small plugin on its own port:
>
> | Skin | Plugin | Port | Stylesheet |
> |---|---|---|---|
> | Decent (legacy) | `plugins/decent-ui.js` | 8888 | `style.css` (real Bootstrap 2.3.2, single column) |
> | ssbski | `plugins/ssbski-ui.js` | 8990 | `ssbski-style.css` |
> | ssbpro | `plugins/ssbpro-ui.js` | 8991 | `ssbpro-style.css` |
> | decent2 | `plugins/decent2-ui.js` | 8992 | `decent2-style.css` |
>
> The shared engine is `lib/ui-server.js` (`createUiServer`); each plugin just passes a different `stylesheetName`/`port`/`appName`/`themeColor`. `ssbski-style.css`/`ssbpro-style.css`/`decent2-style.css` are thin layers over a shared `decent/src/base.css`. The legacy `style.css` is unrelated and still loads Bootstrap.
>
> **The wrinkle this work order removes:** `decent/src/modules/core/app.js` and ~10 sibling modules branch on skin at runtime by *sniffing the stylesheet href* (`document.querySelector('link[href*="ssbpro-style.css"]')`). There are ~50 such branches. They gate (a) wording, (b) DOM structure, and (c) a few features. Because they're decided once at boot, a CSS-only swap can't fully change skin today — hence the convergence.

---

## Decisions (resolved)

1. **Three skins:** `decent2`, `ssbpro`, `ssbski`. **Retire the legacy `decent`** (`style.css`, Bootstrap 2.3.2, single-column DOM). It is the one skin that is *not* a network skin, so it cannot share the unified component tree; it is the main blocker to "one app." Keep its CSS file in-repo as a historical artifact but stop serving it as a selectable skin.
2. **Vocabulary: ssb-default lingo for all features** (see lexicon below). This deletes every per-skin wording fork.
3. **Feature set:** one implementation per feature, adopted for all three skins (see §3). Where skins diverge today, the richest implementation wins.

### The ssb-default lexicon (single source of truth)

| Concept | Variants today | **Unified term** |
|---|---|---|
| Home feed / route `public` | Feed / Discover / Public | **Public** |
| Contacts / route `friends` | Network / Following / Friends | **Friends** |
| DMs / route `private` | Messaging / Chat / Private | **Private** |
| Follow action | Subscribe / Follow | **Follow** / **Unfollow** |
| Follower noun | Subscriber / Follower | **Follower** |
| Following noun | Subscription / Following | **Following** |
| Relationship state | "mutual subscription" etc. | **friend** / **follows you** / **you follow** |
| `#tag` posts | Groups / Channels | **Channels** (`#name`) |
| Right-column trending | Groups / Trending | **Trending** |
| Composer placeholder (public) | "Share an update…" / "What is happening?" | "Write a public message…" |
| Composer placeholder (friends) | "Share with your network…" / "Post to Following…" | "Write to your friends…" |

> All of these are **the existing `decent` fallback strings already in the code** — the ssb-default branch. Unifying = deleting the `isSsbpro ? … : isSsbski ? … : <fallback>` ternaries and keeping the fallback.

---

## 1. How to build, run, and test

```bash
npm run build:web        # REQUIRED after any decent/src change — the page serves the built bundle, not source
node bin.js start        # starts sbot + all UI ports + ws bridge
```

> - `decent/scripts/style.js` copies an **explicit list** of CSS files into `decent/build/`. Any new/renamed CSS must be added there or it won't be served.
> - Browser caches `index.html` and registers a **service worker** — hard-reload / cache-bust after a build when live-verifying (see `memory/project_ssbpro_verify_cache.md`).
> - Start the local sbot early; the UI is useless without it.
> - **Verify live switching specifically:** load one skin, open Themes, pick another, and confirm wording, layout, and the current route's view all change with **no page reload** and **no duplicated live-stream subscriptions** (watch the network/ws panel).

Success criteria:
- One running port can present all three skins; selection persists across reloads.
- Switching skin in the Themes page is instant and complete (CSS + any superset-DOM visibility), no reload.
- ssb-default wording everywhere, in all three skins.
- The legacy `decent` skin is no longer offered.

---

## 2. The single skin accessor (Phase 0 — the unlock)

Create `decent/src/modules/core/skin.js`:

```js
// Active skin is a runtime value, not a compile-time link sniff.
// Seeded from localStorage, falling back to the server-injected <html data-skin>
// (or the linked stylesheet, for back-compat on first load).
var SKINS = ['decent2', 'ssbpro', 'ssbski']
var KEY = 'decent:skin'

function detectDefault () {
  var attr = document.documentElement.getAttribute('data-skin')
  if (SKINS.indexOf(attr) !== -1) return attr
  // back-compat: infer from the linked stylesheet
  for (var i = 0; i < SKINS.length; i++)
    if (document.querySelector('link[href*="' + SKINS[i] + '-style.css"]')) return SKINS[i]
  return 'decent2'
}

exports.list = function () { return SKINS.slice() }
exports.get = function () {
  try { var s = localStorage.getItem(KEY); if (SKINS.indexOf(s) !== -1) return s } catch (e) {}
  return detectDefault()
}
exports.is = function (name) { return exports.get() === name }
exports.set = function (name) { /* set localStorage, data-skin, swap <link> — see Phase 4 */ }
```

Then **replace all ~50 link-sniffs** with `skin.get()` / `skin.is(...)`. Each module currently defines its own `isSsbproSkin()` / `isSsbski()` helper — delete those and import the shared one. Pure refactor, no behavior change yet. Files with sniffs:

- `decent/src/modules/core/app.js` (the big one — `isSsbski`/`isSsbpro`/`isDecent2`/`isNetworkSkin`/`isTopbar` at lines ~30–38, ~30 usages)
- `decent/src/modules/ui/avatar-profile.js`, `message.js`, `message-action.js`, `public.js`, `follow.js`, `private.js`, `network-discovery.js`
- `decent/src/modules/extras/channel.js`, `notifications.js`, `notify.js`

> After Phase 0, `decent2` is the default fallback and all three skins remain network skins. `isNetworkSkin` is always true (legacy decent is gone), so that flag and its `false` branches can be deleted in Phase 3.

---

## 3. Unify the feature set (Phase 2)

Most "feature" differences are **relabels of identical SSB ops** and vanish with the lexicon — no code logic changes:

- **Follow vs Subscribe:** identical `{type:'contact', following}` message. `follow.js` `contactRelation()` + the `update()` verb fork (`pro ? 'subscribe' : 'follow'`) collapse to the ssb-default branch. Delete the `pro` paths.
- **Groups vs Channels:** identical `{type:'post', channel}`. `channel.js` "Group #" → "#"; drop the ssbpro-only group title fork.
- **Following/Followers vs Subscriptions/Subscribers:** `avatar-profile.js` count labels — keep ssb-default words.

The genuine behavior/screen differences — pick one implementation for all three:

| Feature | Today | **Adopt for all** | Notes |
|---|---|---|---|
| DMs (`private` route) | ssbski inbox+thread vs legacy list | **ssbski inbox+thread** | `private.js:547` — make the inbox the default render path; delete `renderLegacy()` fork |
| Tap card → thread | ssbski only (`message.js:530`) | **yes** | drop the `isSsbski()` guard |
| Reaction/action order | ssbski reorders (`message.js:491–493`) | **yes** (one order) | pick one layout for the action row |
| Saved posts | ssbski only | **yes** | promote to a shared feature |
| Profile activity summary | ssbpro only (`avatar-profile.js`) | **yes** | shared profile widget |
| Connect QR codes | ssbpro only (`network-discovery.js`, `app.js` connect button) | **yes** | shared "Connect" affordance |
| Launch splash | ssbski only (`lib/ui-server.js`) | **per-skin cosmetic** | keep as an ssbski-only nicety; not a shared feature |

> The DM inbox is the only real lift here. Do it first within this phase and verify live before deleting `renderLegacy()`.

---

## 4. Phases & estimate

| Phase | Work | Est. |
|---|---|---|
| **0 — Skin accessor** | Add `skin.js`; replace ~50 link-sniffs with `skin.get()`/`skin.is()`. No behavior change. | ~0.5d |
| **1 — One lexicon** | Delete wording forks (`labelForRoute`, `contactRelation`, composer placeholders, "Group #", count labels); one strings table on ssb-default. | ~0.5–1d |
| **2 — One feature set** | Apply §3 winners; delete losing branches. DM inbox is the main lift. | ~1–1.5d |
| **3 — Skins go pure CSS** | Converge remaining DOM to the **superset** (always render topbar-actions, rail profile, etc.); gate visual differences with `html[data-skin=…]` CSS instead of JS. Delete `isNetworkSkin`/`isTopbar` JS branches. | ~1–2d |
| **4 — Themes page** | Gear icon replaces the dark toggle in the top-right; opens a modal with three live `<iframe>` previews + the dark/light toggle moved in. `skin.set()` writes localStorage, sets `data-skin`, swaps `<link>`. | ~1d |
| **5 — Server collapse** | One UI plugin serves all three skin CSS files; `data-skin` injected from the chosen default. Keep `ssbpro`/`ssbski`/`decent2` ports as thin **aliases** that just set the default skin (preserves installed PWAs/bookmarks). Make manifest/theme-color/splash skin-aware. Stop serving legacy `decent`. | ~0.5d |
| **6 — Tests + cleanup** | Update `test/*`, delete dead branches, refresh `docs/frontend.md` + `docs/architecture.md` + this skin model; rename the leftover `.ssbpro-left-stack` to a neutral class. | ~0.5d |

**Total ≈ 5–7 days.** Phase 0 is the unlock and de-risks everything after it; Phases 2–3 hold the bulk of the work.

---

## 5. The Themes page (Phase 4 detail)

- **Gear icon** (`settings` material symbol) replaces `makeThemeToggle()` in `app.js` (currently `decent/src/modules/core/app.js:822`, inside `.topbar-actions`). It opens a modal via the existing `topbarLightbox`.
- **Modal contents:**
  - A row of three **theme tiles**, each a small `<iframe>` rendering a canned mini-feed under that skin's real CSS (most faithful preview). The active one is highlighted. Click = `skin.set(name)`.
  - The **dark/light toggle**, moved out of the top bar into this page. Rename the storage key `ssbpro:theme` → `decent:theme` and make `applyTheme()` apply to all three skins (today it no-ops unless `isTopbar`).
- **`skin.set(name)`** does, in order: write `localStorage['decent:skin']`; set `document.documentElement.setAttribute('data-skin', name)`; swap the `<link rel="stylesheet">` href to `/<name>-style.css?v=…`. Because the DOM, lingo, and features are now identical (Phases 1–3), **no re-render is required** — CSS does the rest. Nav-label *text* is already unified (one lexicon), so it needs no per-skin patching.

> Preview iframes: point each at a lightweight `/preview?skin=<name>` (or `index.html` with a `?skin=` seed that `skin.js` honors and that renders a static sample). Keep them small; four-up is fine for a settings page.

---

## 6. Files touched (map)

- **New:** `decent/src/modules/core/skin.js`; Themes-page module (or extend `app.js`).
- **Heavy edits:** `decent/src/modules/core/app.js` (skin vars, lexicon, header superset DOM, gear/Themes, theme machinery).
- **Edits (de-fork):** `ui/avatar-profile.js`, `ui/message.js`, `ui/message-action.js`, `ui/public.js`, `ui/follow.js`, `ui/private.js`, `ui/network-discovery.js`, `extras/channel.js`, `extras/notifications.js`, `extras/notify.js`.
- **CSS:** `decent/src/base.css` + the three skin files — convert JS-gated structure to `html[data-skin=…]` rules; ensure superset elements have show/hide rules per skin.
- **Server:** `lib/ui-server.js` (inject `data-skin`, serve all skin CSS, skin-aware manifest/theme/splash), `plugins/*-ui.js` (collapse to one + aliases), `lib/builtin-plugins.js`, `decent/scripts/style.js` (CSS copy list).
- **Docs/tests:** `docs/frontend.md`, `docs/architecture.md`, `test/*`.

## 7. Risks & notes

- **DM inbox convergence** (Phase 2) is the only real behavioral surface area — verify live before deleting the legacy private view.
- **Superset DOM** (Phase 3): rendering elements all skins didn't previously have means each skin's CSS must explicitly show/hide them. Audit each skin after this phase for stray/duplicated chrome.
- **PWA back-compat:** keep the per-skin ports as aliases (Phase 5) so existing installs/bookmarks keep working, just defaulting their skin.
- **Dark mode** currently only affects topbar skins via `data-ssbpro-theme`; after Phase 4 it applies to all three under `data-skin`. Migrate the `ssbpro:theme` localStorage key.
- **No feed-mutating CLI against the live default server** while testing (see `memory/project_cli_isolation_gotcha.md`); use a burner sbot for any invite/connection live tests.
