# Work Order: Skin architecture refactor — extract a shared `base.css`

**Status:** Ready for implementation
**Scope:** `ssbski` + `ssbpro` skins only. Decent's legacy `style.css` is **out of scope** (see §7).
**Type:** Pure structural refactor. **Zero intended visual change** to any of the three apps. Success is measured by pixel-identical before/after screenshots, not by new features.
**Intent:** Today `ssbpro-style.css` `@import`s the *entire* `ssbski-style.css` (a sibling skin, not a base) and then overrides ~2,285 lines of it to retune colours and layout. ssbski mixes three concerns in one 4,153-line file: a CSS reset, the Bluesky visual identity (palette, font, logo), and the structural layout/component CSS that ssbpro actually reuses. The result is fragile: a change to ssbski's structure can silently break ssbpro, and ssbpro must override whole rule blocks just to change a colour. This work order separates **structure** (shared) from **identity** (per-skin) so each skin file becomes a thin palette + identity layer over a common `base.css`.

> **Context for whoever picks this up cold:** `ssbc` is a SQLite-backed Secure Scuttlebutt (SSB) server with a WebSocket bridge. The browser frontend lives in `decent/src/` and is built into `decent/build/index.html` (a single inlined bundle). **Three skins share that one bundle**, distinguished only by which stylesheet the UI server links into the served HTML:
>
> | Skin | Plugin | Port | Stylesheet | Theme |
> |---|---|---|---|---|
> | Decent | `plugins/decent-ui.js` | 8888 | `style.css` | `#243447` |
> | ssbski | `plugins/ssbski-ui.js` | 8990 | `ssbski-style.css` | `#1185fe` |
> | ssbpro | `plugins/ssbpro-ui.js` | 8991 | `ssbpro-style.css` | `#0a66c2` |
>
> The DOM and JS are identical across all three — **the skins are pure CSS.** `ssbski-style.css` owns the whole modern three-zone layout (left nav rail, centre feed, right column). `ssbpro-style.css` is `@import url('/ssbski-style.css')` followed by a LinkedIn-style retune. `style.css` is the original single-column Decent client and is unrelated to the other two.

---

## 1. How to build, run, and test

### Build the frontend bundle
The bundle in `decent/build/` is **generated and not committed**. After any change under `decent/src/` you must rebuild:

```bash
npm run build:web
```

This runs `decent/scripts/style.js` (copies the source CSS files into `decent/build/` and regenerates `decent/src/style.css.json`), then browserifies `decent/src/main.js` into `decent/build/index.html` and post-processes it. **The page does not reflect source changes until you rebuild.**

> **Critical:** `decent/scripts/style.js` copies an *explicit list* of files (`style.css`, `ssbski-style.css`, `ssbpro-style.css`, `ssbski-logo.png`). A new `base.css` will **not** reach `decent/build/` — and therefore won't be servable — until you add it to that script (see Phase 2, step 4).

### Run the server
```bash
node bin.js start    # starts sbot + Decent (8888) + ssbski (8990) + ssbpro (8991) + ws bridge
```
Open `http://127.0.0.1:8990/` (ssbski) and `http://127.0.0.1:8991/` (ssbpro).

> **Gotchas (see `memory/`):**
> - Start the local sbot early; the UI is useless without it (`feedback_start_local_sbot.md`).
> - Never run feed-mutating CLI commands against the live server (`project_cli_isolation_gotcha.md`).
> - The browser caches `index.html` and runs a service worker; after every `build:web` you must **hard-reload / cache-bust** or you'll verify stale CSS (`project_ssbpro_verify_cache.md`). This bites doubly here because the `@import`ed `base.css` is **not** cache-busted by the server's `?v=<mtime>` rewrite (that only touches the top-level linked stylesheet). During verification, hard-reload (Cmd-Shift-R) after each build.

### How CSS is served (why this refactor is safe)
`lib/ui-server.js` `serveStatic()` serves **any** file in `decent/build/` with the correct MIME type (`.css → text/css`). The only filename-specific logic is:
- rewriting the HTML's `/style.css` link to the active skin's stylesheet, with a `?v=<mtime>` cache-bust (`ui-server.js:382`);
- stripping the Bootstrap CDN `<link>` for non-Decent skins (`ui-server.js:388`);
- using `ssbski-logo.png` as favicon/splash when `stylesheetName === 'ssbski-style.css'` (`ui-server.js:399`).

`base.css` is **only ever reached through an `@import`**, never linked directly, so it needs **no** ui-server changes. **Do not put the substring `style.css` in its name** — keep it `base.css` — so none of the filename-keyed branches above ever match it.

---

## 2. Target architecture

```
decent/src/
  base.css           ← NEW. Structure + behaviour, fully tokenised. No skin colours, no logo.
  ssbski-style.css   ← THIN. @import '/base.css'; + :root ALF palette (light+dark) + Bluesky identity.
  ssbpro-style.css   ← THIN. @import '/base.css'; + :root LinkedIn palette (light+dark) + pro surfaces.
  style.css          ← UNCHANGED (legacy Decent skin; out of scope — see §7).
```

**Cascade contract:**
1. A skin file's **first** statement is `@import url('/base.css');` (CSS requires `@import` before all other rules).
2. `base.css` styles every structural element using `var(--token, <sensible-fallback>)`. It defines **no** `:root` palette of its own beyond fallbacks baked into each `var()`.
3. Each skin file then declares `:root { … }` (and its `@media (prefers-color-scheme: dark) :root { … }`) defining the tokens. Because the skin's `:root` comes *after* the import, it wins the cascade at equal specificity.
4. Skin-unique **surfaces** (things `base.css` knows nothing about — e.g. ssbpro's network dashboard) live only in that skin file.

The win: **ssbpro stops importing ssbski.** A change to Bluesky's identity can never again leak into or break the professional skin, and recolouring a skin is a `:root` edit, not a rule-block override.

---

## 3. What goes where — the classification

Use this empirical heuristic, confirmed by audit: **anything ssbpro currently inherits unchanged from ssbski is structure → `base.css`; anything ssbpro overrides or adds is identity/surface → stays in a skin file.** Rule-count evidence from the current `ssbpro-style.css` (it `@import`s ssbski, so a low count = "inherited as-is"):

| Concern | ssbpro override rules | Disposition |
|---|---|---|
| Git / forge (browser, tree, diff, syntax, repos) | 0 | **base.css** (100% inherited) |
| Reactions (trays, picker, chips, heart-burst, popover) | ~2 | **base.css** |
| Layout shell / nav rail | ~4 (minor) | **base.css** + tiny pro override |
| Post cards, action row, composer modal, profile, chat, responsive | mostly inherited | **base.css** + tiny pro overrides |
| Network discovery dashboard | ~12 | **ssbpro only** |
| Groups / channels | ~34 | **ssbpro only** |
| Connect / Scan-QR flow | ~57 | **ssbpro only** |
| Bio-aware feed cards | ~51 | **ssbpro only** |
| Top-bar mobile profile shortcut | present | **ssbpro only** |
| ALF palette (light+dark), Inter font, hermit-crab logo/wordmark | n/a | **ssbski only** |

### Section map of today's `ssbski-style.css` (banner line numbers)
Move the **structural** banner sections into `base.css`; keep the **identity** preamble in `ssbski-style.css`.

| Lines (≈) | Banner | → Destination |
|---|---|---|
| 1–100 | Header comment, `:root` ALF palette (light), dark `:root` | **ssbski** (identity) |
| 101–291 | Reset, fonts, link defaults, focus, notif card, base buttons | **base** (reset/focus/buttons/notif) + **ssbski** (Inter `--app-font`) |
| 292 | Layout shell | base |
| 361 | Sticky centre-column header | base |
| 463 | Left nav rail | base (structure) + **ssbski** (logo/wordmark, see note) |
| 676 | "New Post" composer button | base |
| 724 | Right column (search) | base |
| 970 | Post cards | base |
| 1183 | Action row | base |
| 1312 | Reactions | base |
| 1676 | Composer modal | base |
| 1823 | Quotes, embeds, git, media | base |
| 1855 | Keys page | base |
| 2134 | Git forge | base |
| 3263 | Profile page | base |
| 3661 | Key page | base |
| 3735 | Responsive | base |
| 3860 | Chat (DMs) | base |

> **Logo / wordmark exception (nav rail, ssbski lines ~504–555):** the hermit-crab brand square and "SSBSKI" wordmark are Bluesky identity, not structure. Keep the *rail geometry* in `base.css` but keep the *brand image rules* in `ssbski-style.css`. (`ssbpro` already has no rail logo, so this never affected it.) Drive the brand block off a token/class so base reserves the slot and the skin fills it.

---

## 4. Tokenisation is the load-bearing step

The reason ssbpro overrides whole rule blocks today is that ssbski hard-codes colours inside structural rules. **Before splitting, make every structural rule read its colours/font/radii/shadows from tokens.** Most already use `--sky-*`; the job is to catch the stragglers.

1. In `ssbski-style.css`, audit the structural sections (§3 map) for **hard-coded values** that should be tokens:
   ```bash
   # hex colours and rgba() not already inside a var() fallback:
   grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(' decent/src/ssbski-style.css
   ```
   For each hit in a structural rule, replace with `var(--token, <that-value>)`, defining the token in `:root` (light) and the dark `:root` if it differs. Reuse existing `--sky-*` tokens wherever one already means that role; only add a token when none fits.
2. Generalise identity-named tokens that base.css will depend on. `base.css` should not reference Bluesky-flavoured names. Introduce neutral aliases and have each skin map them:
   - `--app-font` (ssbski → `'InterVariable', …`; ssbpro inherits or sets its own).
   - Keep the existing `--sky-*` token **names** as-is to minimise churn (renaming 700 references is pure risk); just ensure `base.css` only ever *consumes* them and each skin *defines* them. (A later cosmetic pass can rename `--sky-*` → `--ui-*` if desired — **not** in this work order.)
3. After tokenising, rebuild and confirm **ssbski and ssbpro are still pixel-identical** to the Phase 0 baseline. This validates the tokenisation independently of the file move, so a regression is attributable to one step, not two.

---

## 5. Execution phases

### Phase 0 — Baseline capture (do this first, do not skip)
Screenshot every major route on **both** ssbski (8990) and ssbpro (8991), in **light and dark** (toggle OS appearance), desktop **and** ≤700px mobile width. Minimum route set:
`#public` (feed), a thread, `#profile/<self>`, a git repo home + a blob/diff view, `#private` (chat list + a thread), the composer modal, and (ssbpro only) the Network tab, a Group/channel page, and the Connect/Scan-QR screens.
Save under `docs/img/skin-refactor-baseline/`. These are the regression oracle for Phases 1–2.

### Phase 1 — Tokenise (no file move)
Do §4 entirely within `ssbski-style.css`. Rebuild, hard-reload, screenshot the same routes, diff against Phase 0. **Must be pixel-identical** before proceeding.

### Phase 2 — Split and rebase
1. Create `decent/src/base.css`. **Move** (cut, not copy) the structural banner sections (§3 map) out of `ssbski-style.css` into it, preserving order. Add a header comment explaining base/skin separation and the cascade contract (§2).
2. Reduce `ssbski-style.css` to: `@import url('/base.css');` → `:root` light palette → dark `:root` → `--app-font` and other identity tokens → the logo/wordmark rules → any genuinely Bluesky-only surface. It should shrink dramatically (target: a few hundred lines).
3. Rewrite `ssbpro-style.css`'s first line from `@import url('/ssbski-style.css');` to `@import url('/base.css');`. ssbpro must now define its **own** complete `:root` (light + dark) — it can no longer rely on ssbski's palette. Keep all pro-unique surfaces (network/groups/bio/connect/top-bar) and the small set of genuine structural overrides (e.g. the action-row `nowrap` divergence noted at `ssbpro-style.css:720`). **Label that override block clearly** as "structural divergence from base" so future readers know it's intentional, and minimise it.
4. Add `base.css` to `decent/scripts/style.js`: declare `srcBaseCss`/`destBaseCss` alongside the others and copy it into `build/` (mirror the existing `ssbpro` copy block). Without this, `/base.css` 404s and **both** skins render unstyled.
5. Rebuild, hard-reload all three apps (ssbski, ssbpro, **and Decent at 8888** to prove it's untouched), and diff every route against Phase 0. **Must be pixel-identical.**

> **Dev cache caveat for `base.css`:** the server only cache-busts the top-level linked stylesheet, not the `@import`ed `base.css`. During development, hard-reload after each build. *(Optional hardening, only if it proves annoying: have `ui-server.js` rewrite `@import url('/base.css')` → `@import url('/base.css?v=<mtime>')` the same way it busts the main link. Mention it; don't build it unless needed.)*

### Phase 3 — (OUT OF SCOPE, noted for continuity)
Promoting genuinely generic ssbpro features (bio-aware feed cards, the consolidated Connect/QR flow) *down* into `base.css` so ssbski gains them is a **separate feature change** with its own visual diffs and is explicitly **not** part of this refactor. Do not attempt it here; this work order must remain visually inert.

---

## 6. Acceptance criteria
- [ ] `decent/src/base.css` exists and contains the shared structural CSS, fully tokenised (no hard-coded skin colours, no logo image rules).
- [ ] `ssbski-style.css` = `@import '/base.css'` + ALF palette (light+dark) + Inter/identity tokens + logo/wordmark + Bluesky-only surfaces; substantially smaller than before.
- [ ] `ssbpro-style.css` imports `/base.css` (**not** ssbski), defines its own complete light+dark `:root`, retains all pro surfaces, and its structural-divergence overrides are minimised and clearly labelled.
- [ ] `decent/scripts/style.js` copies `base.css` into `decent/build/`.
- [ ] `npm run build:web` succeeds; `npm run lint` passes.
- [ ] ssbski, ssbpro, **and** Decent are pixel-identical to the Phase 0 baseline across all routes, in light + dark, desktop + mobile.
- [ ] Grep confirms `ssbpro-style.css` no longer references `ssbski-style.css`.
- [ ] No new 404s in the browser network panel (especially `/base.css`) for any skin.

## 7. Why Decent (`style.css`) is excluded
`style.css` is the legacy single-column client with its **own** copies of reactions/git CSS, no token system, and no dark mode. It is also special-cased in the build: `style.js` generates `decent/src/style.css.json` from it for app.js's inline-style fallback (the other skins rely on the `<link>`). Folding it onto `base.css` is a larger, riskier migration (and a product decision about whether the classic skin survives at all). Keep it untouched here; revisit separately once base.css has proven stable.

## 8. Risks & mitigations
- **Cascade/specificity surprises after the move.** Mitigated by moving sections *in order* and verifying pixel-identity per phase; never reorder declarations within a section.
- **`@import` ordering.** `@import` must precede every other rule in each skin file, including `:root`. A stray rule above the import silently drops the base — check this if a skin renders unstyled.
- **Missing `base.css` in build.** Causes total style loss for both skins; the Phase 2 step-4 + the "no new 404s" check catch it.
- **Stale cache masking a real regression (or hiding a fix).** Always hard-reload after `build:web`; see `memory/project_ssbpro_verify_cache.md`.
- **Over-tokenising.** Don't invent tokens for one-off structural values (a `0` margin, a `flex: 1`). Tokens are for colours, fonts, radii, shadows, and the few shared layout dimensions already expressed as `--sky-*-width`.
