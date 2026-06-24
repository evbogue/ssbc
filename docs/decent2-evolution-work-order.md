# Work Order: `decent2` — a "Bootstrap 2, evolved" skin alongside the original

**Status:** ✅ Implemented (first cut). Decisions resolved: **A = recreate the look in clean CSS** (no real Bootstrap loaded), **B = top navbar** (the mockup layout).

> **AS BUILT — correction to the original premise.** This work order first assumed decent2 could be "pure CSS like ssbpro." That was wrong: `app.js` renders **skin-conditional DOM** (`isNetworkSkin` gates the entire three-zone scaffold — feed-header, nav labels, right column, brand). A new CSS-only skin falls into the classic single-column Decent DOM. So decent2 also required **additive** `app.js` changes: `isDecent2` detection, `isNetworkSkin |= isDecent2`, and a new `isTopbar = isSsbpro || isDecent2` gating the shared top-bar DOM (left stack, profile placement), plus 3-way branding (right-brand word/logo, document title). These changes are additive only — ssbpro/ssbski/decent flag values are unchanged, so those skins are byte-for-byte unaffected (verified). The shared `.ssbpro-left-stack` class name is reused as-is (decent2 styles it); rename to a neutral name is deferred cleanup.
>
> **Files delivered:** `plugins/decent2-ui.js`, `decent/src/decent2-style.css`, `decent/src/icons/decent2-{192,512}.png`; edits to `lib/builtin-plugins.js`, `lib/ui-server.js`, `decent/scripts/style.js`, `decent/src/modules/core/app.js`. Runs at **http://127.0.0.1:8992/**; the original `decent` artifact runs at **http://127.0.0.1:8989/**.
>
> **Deferred to a follow-up:** the topbar Connect button + manual light/dark toggle (decent2 uses `prefers-color-scheme` for midnight in this cut); glossing the git/forge, profile, and chat screens (they currently inherit base.css's flat look); mobile polish; and `docs/decent-evolution.md` with the side-by-side captures.

## Widget / component inventory (toward full mock parity)

**A. Done — glossed for decent2**
- Top navbar: brand wordmark, labelled nav + glossy active state, light/dark toggle
- Left column: identity card, "New post" primary compose button
- Centre: feed tabs (Discover/Following), post cards, mini git-push rows
- Action buttons: Reply/Repost/Quote (icon+label) + react, glossy
- Button range: `.btn` default + `.btn-primary`, the dark-bar `.theme-toggle`
- Reaction pill / chips, git branch badge
- Right column: Trending card, footer links, brand tile, search field

**B. Exists in the app but still inherits base.css's FLAT look — needs a decent2 gloss pass**
1. Composer modal (New post dialog): textareas, attach control, preview/Publish/Cancel buttons
2. Reaction system surfaces: quick-react tray, full emoji picker panel, who-reacted popover
3. Quoted / embedded post cards, repost cards
4. Profile page: header/banner, Follow / Message / Mention buttons, petname (nickname) control
5. Git/forge screens: repo home, file tree table, blob view, inline diff, commit log, issue/PR lists + state badges, syntax highlighting palette
6. Chat / DMs: conversation list, thread bubbles, bottom composer, new-chat modal
7. Notifications list, Keys page, search results
8. Image lightbox, the "more" dropdown menu, empty states

**C. Button range to formalise (Bootstrap-2 set)**
Default ✓, primary ✓, toggle ✓ — still to add as needed: small/large sizes, disabled state, destructive/danger variant, a true connected `.btn-group` (for static rows where the react-tray problem doesn't apply), and a plain icon-button variant.

**D. In the mock but NOT in the real DOM (new widgets — optional, need JS not just CSS)**
- Left **nav-list** sidebar (Public/Channels/Git/Settings) under the identity card — the real nav lives only in the top bar; adding a left list duplicates it (skip unless wanted)
- Right-column **"Active pubs"** status widget (dots) and a **"Discover the network"** hero — the real right column shows Trending + footer instead

**Known layout divergences from the mock (by design):** search sits at the top of the right column (not in the bar); the topbar holds the only nav (no left nav-list). Both are intentional to avoid duplicated navigation.

_Original plan below (kept for context); the decisions in §2 are now resolved as above._

**Status (original):** Draft — two decisions to confirm (§2) before implementation
**Scope:** Add a **new** skin. The original `decent` skin (`style.css`, port 8888) is **frozen and untouched** — it is the historical artifact. `decent2` is a new sibling skin built on the shared `base.css`.
**Intent:** Show the evolution of the client side by side: the original single-column, real-Bootstrap-2.3.2, hardcoded-colour client from ~2014, and `decent2` — the same DOM reinterpreted with modern infrastructure (the tokenised three-zone shell, dark mode, responsive) while *deliberately keeping the Bootstrap 2 tactile aesthetic* (gradients, bevels, glossy buttons, wells, the dark gradient navbar). Both run at once so the "ten years ago vs now" story is literally clickable.

> **Visual spec:** the approved concept is checked in at [docs/decent2-mockup.html](decent2-mockup.html) (open it over a local static server — `python3 -m http.server` from `docs/`, then `/decent2-mockup.html`). It shows the light and "midnight" variants and is the source of truth for the look. All glossy recipes in §5 are distilled from it.

> **Context for whoever picks this up cold:** `ssbc` is a SQLite-backed SSB server. The browser frontend lives in `decent/src/`, built into `decent/build/index.html` (one inlined bundle). Skins are **pure CSS over a shared DOM**, each served by a small plugin on its own port. As of the base.css refactor there are three: `decent` (`style.css`, 8888, still loads Bootstrap 2.3.2), `ssbski` (`ssbski-style.css`, 8990), `ssbpro` (`ssbpro-style.css`, 8991). `ssbski-style.css` and `ssbpro-style.css` are thin: each does `@import url('/base.css')` then supplies a `:root` palette (+ skin-specific surfaces). `base.css` owns the entire tokenised three-zone shell + components and defines no palette. **`decent2` is built exactly like `ssbpro`:** `@import base.css` + palette + an override layer.

---

## 1. Why this is the low-risk path
- The original `decent` is **never modified** — zero regression risk to the artifact.
- `decent2` is three-zone, so it reuses **all** of `base.css` (shell + components) the same way ssbski/ssbpro do. **No `base-core`/`base-shell` split is needed** (that was only required to give a *single-column* skin shared components).
- ssbpro has already solved every structural problem decent2 faces — most importantly **converting base's left nav rail into a top navbar** (`ssbpro-style.css` `.navbar` rules). decent2 borrows that pattern, then swaps ssbpro's flat surfaces for glossy ones via tokens.

## 2. Decisions to confirm before coding
**Decision A — recreate the Bootstrap look in clean CSS, or load real Bootstrap 2?**
- **(Recommended) Recreate it.** decent2 strips Bootstrap (the ui-server already strips it for every skin whose stylesheet name ≠ `style.css`, so this is the default) and recreates the gloss in its own tokenised CSS. The mockup proves this is modest CSS and it stays consistent with the other modern skins — no two-cascade conflicts between Bootstrap and `base.css`. The *evolution story is stronger this way*: the original literally runs Bootstrap 2; decent2 is a clean-room homage.
- **Alternative — keep real Bootstrap 2 loaded.** Authentic buttons/navbar for free, but ties decent2 to unmaintained CSS and risks Bootstrap rules fighting `base.css` over the same DOM. Requires changing the ui-server strip condition to spare `decent2-style.css`.

**Decision B — top navbar (as in the mockup) or a glossy left-rail sidebar?**
- **(Recommended) Top navbar** — matches the approved mockup; reuses ssbpro's rail→topbar conversion. Slightly more override CSS.
- **Alternative — keep base's left rail**, styled as a glossy `.nav-list` well-sidebar. Less override work and also very Bootstrap-2, but diverges from what you've seen.

This work order assumes **A = recreate, B = top navbar** (the recommended pair). Flag if you want otherwise.

---

## 3. New / changed files
| File | Change |
|---|---|
| `plugins/decent2-ui.js` | **new** — mirror `plugins/ssbpro-ui.js`: `configNamespace: 'decent2'`, `defaultPort: 8992`, `stylesheetName: 'decent2-style.css'`, `appName: 'decent2'`, `themeColor: '#0088cc'`, `buildDir = decent/build`. |
| `lib/builtin-plugins.js` | register `{ name: 'decent2-ui', path: '../plugins/decent2-ui', kind: 'infra' }` immediately after the `ssbpro-ui` entry. |
| `decent/src/decent2-style.css` | **new** — `@import url('/base.css');` + light palette `:root` + `@media (prefers-color-scheme: dark) :root` (midnight) + glossy override layer (§5). |
| `decent/scripts/style.js` | copy `decent2-style.css` → `build/` (mirror the `base.css`/ssbpro copy blocks). |
| `lib/ui-server.js` | extend the `skin` computation (~line 277) to map `'decent2-style.css' → 'decent2'` so `pwaIcon` resolves to `/icons/decent2-192.png`. (Bootstrap strip and the ssbski-only favicon branch need **no** change.) |
| `decent/src/icons/` + build | add `decent2-192.png` / `decent2-512.png` (or, interim, have the plugin reuse decent's icon). |

> `stylesheetName` must contain the substring `style.css` so the app's inline-fallback check fires — `decent2-style.css` satisfies this. The `@import`ed `base.css` is already copied to `build/` and served.

## 4. Token starter set (from the mockup)
```
/* light */                          /* midnight */
--sky-bg:        #e7e9ec             #191b1e
--sky-surface:   #ffffff             #2c2f34   (decent2 uses surface as gradient TOP)
--decent2-surf-bot: #f6f7f9          #232529   (gradient BOTTOM — new token)
--sky-text:      #2b3138             #e7eaed
--sky-muted:     #717a85             #9aa2ac
--sky-blue:      #0088cc             #2f9fe0
--decent2-blue2: #0a64b8             #1b78bd   (gradient bottom of primary/blue fills)
--sky-border:    #ccd1d8             #34383e
--decent2-well-top/bot, --decent2-bevel, --decent2-well-inset, --decent2-card-bevel  (see §5)
```
Reuse the existing `--sky-*` names where base.css consumes them (so base's components theme correctly); add `--decent2-*` only for the gloss primitives (gradient stops, bevel shadow-stacks) base doesn't know about.

## 5. Glossy override recipes (the decent2 identity layer)
Distilled from [docs/decent2-mockup.html](decent2-mockup.html). Each overrides a base component:
- **Navbar** (`.navbar`, adapted from ssbpro's topbar): `background: linear-gradient(var(--nav-top), var(--nav-bot))`, `box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 1px 4px rgba(0,0,0,.35)`; brand wordmark + `inset 0 2px 0 var(--sky-blue)` on the active link.
- **Primary button** (`.btn-primary`, "New post"/Follow): `linear-gradient(var(--sky-blue), var(--decent2-blue2))`, `text-shadow: 0 -1px 0 rgba(0,0,0,.3)`, `box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 1px 2px rgba(0,0,0,.18)`.
- **Default button + grouped action row** (Reply/Repost/Like): `linear-gradient(#fff,#e8ebee)` (light), 1px border, `inset 0 1px 0 rgba(255,255,255,.6)`, white text-shadow; grouped buttons share borders with negative margins (the BS2 `.btn-group`).
- **Wells & cards** (`.feed-header`, right-column cards, identity card): subtle `linear-gradient(top,bot)` + `inset` shadow (`--decent2-well-inset`) for the recessed look; post cards get a top-edge bevel highlight (`--decent2-card-bevel`).
- **nav-list active row**: glossy blue gradient like the primary button.
- **feed tabs** (`.feed-header__tab--active` → restyle as BS2 `.nav-tabs`): active tab uses the surface gradient and "dips" into the content with a matching bottom border.
- **Midnight**: same recipes with charcoal stops and a faint `rgba(255,255,255,.05–.07)` top bevel; brightened blue. This is the craft-heavy part — gradients muddy on dark, so keep stops close and bevels subtle-but-present.

## 6. Evolution showcase (the point of all this)
- Both skins run simultaneously: original `decent` on 8888, `decent2` on 8992.
- Add `docs/decent-evolution.md`: side-by-side screenshots (original single-column vs decent2 three-zone, light + midnight) with a short "what changed and why" narrative — single column → three-zone use of space, hardcoded → tokens, no dark mode → midnight, real Bootstrap 2 → clean-room homage.
- Optional: a one-line banner/link in each skin's footer pointing at the other ("← the 2014 original" / "the 2024 reimagining →").

## 7. Phases
1. **Wire it up.** Add plugin + registration + style.js copy + ui-server skin case. `decent2-style.css` = just `@import base.css` + a placeholder palette. Start the server, confirm `decent2` serves at 8992, `base.css` loads, renders as a plain three-zone reskin. (Proves plumbing with near-zero CSS.)
2. **Top navbar.** Port ssbpro's rail→topbar conversion; brand wordmark; nav items.
3. **Gloss layer (light).** Apply §5 recipes; tune against the mockup.
4. **Midnight.** Add the dark `:root` + dark bevel tuning; verify via `prefers-color-scheme` and screenshots.
5. **Responsive.** Three zones → single column; navbar collapse; check ≤700px.
6. **Showcase.** `docs/decent-evolution.md` + side-by-side captures; optional cross-links.

## 8. Acceptance criteria
- [ ] Original `decent` (8888) is byte-for-byte unchanged (`git diff` touches no `style.css`).
- [ ] `decent2` serves at 8992; `decent2-style.css` and `base.css` both return 200; no console errors / 404s.
- [ ] `decent2` renders the three-zone glossy layout in light **and** midnight, matching the mockup intent.
- [ ] ssbski (8990) and ssbpro (8991) are unaffected.
- [ ] `npm run build:web` + `npm run lint` pass; `docs/api-reference.md` regenerates cleanly (builtin-plugins list changed).
- [ ] `docs/decent-evolution.md` exists with the side-by-side comparison.

## 9. Risks
- **Gloss calibration** — too flat reads as "flat-with-extra-steps"; too heavy reads as "old website." The mockup's light variant is near the sweet spot; midnight wants slightly more bevel contrast. Iterate against screenshots, not blind.
- **Topbar duplication** — decent2 and ssbpro will both carry a rail→topbar conversion. Acceptable now; if a third skin wants a topbar, factor it into a shared optional layer then.
- **Cache** — after every `build:web`, hard-reload; the `@import`ed `base.css` isn't cache-busted by the server (`memory/project_ssbpro_verify_cache.md`).
- **api-reference drift** — `builtin-plugins.js` feeds `scripts/gen-api-reference.js`; regenerate so `docs/api-reference.md` stays in sync.
