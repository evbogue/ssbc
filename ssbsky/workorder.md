# ssbsky — work order

A Bluesky-skinned fork of the Decent web client. Same SSB engine, same data,
same identity — a different skin, served on its own port.

> Status: Stage 3 has landed. ssbsky now has its own same-origin UI server and
> a base Bluesky-style skin with CSS variables, flattened feed rows, dark mode,
> compact action/reaction styling, and ssbsky-only Discover/Following/Chat copy.

## Thesis

Decent stays exactly as it is. **ssbsky** is an additive fork that reuses
Decent's working SSB engine and replaces only the presentation, to match the
look and interaction patterns of the Bluesky web client as closely as is
reasonable — *without* rebuilding it as a React/React-Native app.

The cheapest viable version is **"Decent's brain, Bluesky's skin"**: the exact
same JavaScript bundle Decent ships, served with a different stylesheet on a
second port. Structural pieces that CSS genuinely can't reach come later.

## Locked decisions

- **Name:** ssbsky (yes, to be annoying).
- **Keep git/code.** The Code Activity and Repositories screens stay — Bluesky
  has no equivalent, and git-over-SSB is core to this project.
- **Keep emoji reactions.** Decent's reactions stay; we do not reduce to a
  Bluesky-style like-only model. They get restyled, not removed.
- **New port, not a route under Decent.** ssbsky is served on its own port
  (e.g. 8990) so a subdomain can point straight at it. Decent is untouched.
- **Same origin for everything.** The ssbsky origin serves HTML/CSS/JS, blobs,
  git HTTP routes, docs, and the websocket remote. Do not make the browser
  connect cross-origin to Decent's websocket port.
- **Launch by default.** There is no feature flag for the first cut:
  `node bin.js start` should start Decent and ssbsky in the same process.
- **Config namespace:** ssbsky mirrors Decent's config shape with
  `ssbsky.host` and `ssbsky.port`. Defaults are `127.0.0.1` and `8990`.
- **Maximize reuse of Decent's JS.** No framework rewrite. Ideally zero JS
  changes for the first shippable cut.
- **Use Bluesky-ish language where the mapping is honest.** In the ssbsky skin,
  low-risk copy/label changes are allowed so the UI reads more like Bluesky.
  Decent's copy stays unchanged.

## How much is achievable by swapping the stylesheet alone?

Roughly **~75% of the Bluesky visual feel** ships with CSS only, because
Decent's DOM is semantic flexbox and the nav labels already exist in the DOM
as `title`/`aria-label` attributes — CSS can surface them as visible text via
`content: attr(aria-label)` on a pseudo-element.

### Achievable with CSS alone

- Palette, typography (system sans), spacing → Bluesky blue on white surfaces.
- Flatten `.message-card` from boxed cards into hairline-separated post rows.
- Restyle the action row (reply / repost / like / reaction) into Bluesky's
  icon + count style.
- Rename ssbsky-visible labels where the SSB behavior maps cleanly:
  Public → Discover, Friends → Following, Private → Chat/DMs. Keep git/code
  labels explicit because Bluesky has no equivalent and git-over-SSB is core.
- **Left rail:** the top `.navbar` is flexbox — re-anchor it to a fixed
  vertical rail (`flex-direction: column`, fixed left, push `.screen__content`
  over with `margin-left`) and pull labels in with `attr()`.
- **Mobile bottom tab bar:** a media query re-pins that same navbar to the
  bottom; the icon-only nav is already shaped like a tab bar.
- Reposition the compose FAB / inline prompt into a rail "New Post" button.
- Profile, thread, and the compose modal: recolor and reflow.
- **Dark mode** following the OS — a `@media (prefers-color-scheme: dark)`
  override on a CSS-variable palette. No JS, no toggle needed for v1.

### Needs DOM / module work (CSS cannot do these)

- **Right-hand discover column** (search + suggested follows + trends) — that
  content and data does not exist in the DOM at all.
- **In-feed Following / Discover tabs** — Decent's Public and Friends are
  separate routes, not one tabbed timeline. Merging them is structural.
- **Profile follower/following/post counts** in Bluesky's header layout — the
  banner field already exists as Decent's `about.headerImage`, but the counts
  and any new header metadata need data/layout wiring.
- **Always-visible shortened pubkeys in post/profile headers** — useful for
  disambiguating petname/display-name collisions, but this needs DOM/module
  support unless an existing attribute can be safely surfaced.
- Quote-embeds-as-cards, share sheet, feeds/lists — feature-level.

## Architecture

- ssbsky = **Decent's exact JS bundle** (`decent/build/index.html`) + a
  different stylesheet (`ssbsky-style.css`), served by the sbot on a second
  port. Same-origin injected ws remote → same identity, same data, runs alongside
  Decent.
- Do **not** copy-paste `plugins/decent-ui.js` wholesale. Extract the shared
  HTTP/static/ws/git/blob/doc serving machinery into a small helper module, then
  have `plugins/decent-ui.js` and `plugins/ssbsky-ui.js` call it with different
  options:
  - plugin name / log prefix
  - config namespace (`decent` vs `ssbsky`)
  - default/configured port (Decent's configured port vs ssbsky's default `8990`)
  - stylesheet href (`/style.css` vs `/ssbsky-style.css`)
  - launch message
- `plugins/ssbsky-ui.js` should be a thin wrapper around that helper, not a
  second divergent implementation of blob uploads, git routes, docs routes,
  path validation, content types, or websocket remote derivation.
- The build step compiles/copies only the new CSS. The JS bundle remains the
  Decent bundle.
- The ssbsky HTTP server must expose the same same-origin surface Decent exposes:
  `/`, `/style assets`, `/blobs/add`, `/blobs/get/:hash`, `/git/*`, `/docs/*`,
  and websocket upgrade on the ssbsky port. The frontend already builds blob and
  git URLs from `window.location.origin`, so a "static-only ssbsky server" is
  not sufficient.
- `plugins/ssbsky-ui.js` should be registered in `bin.js` before `ssb-ws`, the
  same as `plugins/decent-ui.js`, so both UI helpers append their websocket
  server entries before `ssb-ws` builds the multiserver listeners.

### Implementation hazards to handle deliberately

1. **The built HTML already links `/style.css`.**
   `decent/scripts/postprocess-index.js` inserts hardcoded Decent stylesheet
   links into `decent/build/index.html`. `plugins/decent-ui.js` only injects a
   stylesheet when the HTML does not already contain one, so ssbsky cannot rely
   on "extra injection" alone.

   **Solution:** when serving `index.html` for ssbsky, rewrite the preload and
   stylesheet links from `/style.css` to `/ssbsky-style.css` before sending the
   response. Keep Decent's served HTML unchanged. A second generated
   `ssbsky-index.html` is acceptable if that ends up cleaner, but the first
   cut should prefer a small server-side rewrite so the JS build stays single.

2. **The inline fallback stylesheet check is substring-based.**
   `decent/src/modules/core/app.js` only recognizes an external stylesheet
   whose href contains `style.css`; otherwise it injects Decent's inline CSS
   fallback from `style.css.json` and the skins fight.

   **Solution:** keep the ssbsky filename as `ssbsky-style.css`. It contains
   the `style.css` substring, so the existing fallback check sees it and does
   not inject Decent's inline CSS. Do not rename it to something like
   `ssbsky.css` unless the app fallback logic is also changed.

3. **The websocket server config must be additive.**
   Current Decent startup attaches its HTTP server to
   `config.connections.incoming.ws`. ssbsky needs its own websocket listener on
   the ssbsky HTTP server so the injected remote can be same-origin
   (`ws://127.0.0.1:8990~shs:<key>` locally, `wss://ssbsky.example~shs:<key>`
   behind HTTPS).

   **Solution:** the shared helper should append a ws incoming config for each
   UI HTTP server while preserving existing entries. Do not replace Decent's ws
   entry when adding ssbsky. If repeated init needs dedupe, dedupe by the exact
   `server` object or port. Confirm this against `ssb-ws`, which supports
   multiple ws servers.

   **Stage-2 gotcha:** preserve Decent's historical fallback from `decent.port`
   to `config.ws.port`, but do not let ssbsky inherit `config.ws.port` by
   accident. If `ssbsky.port` is unset, ssbsky should default to `8990`, not the
   global websocket port (`8989` in the local default config). The helper now has
   an explicit `useWsPortFallback` option: Decent opts into the legacy fallback,
   and ssbsky should leave it off.

4. **Same-origin behavior is the first thing to verify.**
   `8990` is a different origin from Decent, but ssbsky itself must be internally
   same-origin: page, websocket, blobs, git, and docs all served from the ssbsky
   origin. Production subdomain proxying should forward websocket upgrades to the
   ssbsky server, not to Decent's port.

   **Solution:** Stage 2 must verify identity and feed loading from
   `http://127.0.0.1:8990/` before any serious CSS work lands. Inspect the
   logged `ssbsky-ui ws remote:` value and confirm it points at the ssbsky
   origin. Behind the intended proxy, confirm `x-forwarded-host` /
   `x-forwarded-proto` produce `wss://<ssbsky-subdomain>~shs:<key>`.

## Concept mapping: SSB → Bluesky

| Bluesky                     | SSB / Decent                                  |
|-----------------------------|-----------------------------------------------|
| Account / handle            | Feed `@id`; handle derived from `about` name  |
| Following feed              | Decent "Friends" (follow graph)               |
| Discover feed               | Decent "Public" (chronological, not ranked)   |
| Notifications               | mentions / likes / follows to you             |
| Chat (DMs)                  | Decent "Private"                              |
| Like / Repost / Reply/Quote | already exist in Decent                       |
| Feeds / topics              | SSB channels (`#hashtag`)                      |
| (no equivalent)             | Git/Code — kept as a custom rail item          |
| Like-only                   | Decent emoji reactions — kept                  |

## Proposed stages

1. **DONE: Refactor shared UI serving without behavior changes.** Extract the reusable
   serving helper, keep Decent on its configured port, keep `/style.css`, and
   verify the Decent UI still loads. Landed as `lib/ui-server.js` plus a thin
   `plugins/decent-ui.js` wrapper.
2. **DONE: Serve ssbsky on its own port** with a near-empty `ssbsky-style.css` — prove
   the second-port + same-origin ws remote + identity path end to end against
   the live sbot. Confirm Decent still loads in the same process. ssbsky is
   default-on, uses `ssbsky.host` / `ssbsky.port`, and defaults to
   `http://127.0.0.1:8990/`. The stage-2 stylesheet may include tiny placeholder
   or structural CSS, but should not attempt the full visual theme yet.
3. **DONE: Base theme:** palette **(on CSS variables)**, type, flatten post rows,
   action-row restyle. Add the `prefers-color-scheme: dark` override here so
   dark mode ships with the base theme. Also land safe ssbsky-only language
   changes: Public → Discover, Friends → Following, Private → Chat/DMs, while
   keeping git/code explicit. Emoji reactions remain visible and are styled as
   compact reaction/action affordances, not hidden behind a like-only fiction.
4. **Left rail:** reposition navbar + `attr()` labels + "New Post" button.
5. **Mobile bottom tab bar:** media query.
6. **Profile / thread / compose-modal** theming.
7. *(structural, later)* Right discover column; unified Following/Discover
   timeline tabs; profile header refinement around Decent's existing
   `about.headerImage` field + follower/following/post counts.

Recommendation: ship stages 1–6 (the CSS-only fork, dark mode included) as the
first cut, get it on the subdomain, then decide whether stage 7 is worth the
structural cost.

## First-cut acceptance criteria

- `node bin.js start` serves Decent at its configured port.
- The same process serves ssbsky by default at `http://127.0.0.1:8990/`, unless
  overridden via `ssbsky.host` / `ssbsky.port`.
- Both origins inject a working same-origin `window.PATCHBAY_REMOTE` for the
  same sbot identity: Decent points at the Decent origin, ssbsky points at the
  ssbsky origin.
- Decent loads `/style.css`; ssbsky loads `/ssbsky-style.css`; ssbsky does not
  also inject the inline Decent fallback CSS.
- Blob upload/get routes, docs routes, and git HTTP routes work from both
  Decent and ssbsky after the shared-helper refactor.
- `npm run build:web` still produces the existing Decent bundle.
- `npm test` passes before commit.

Note: Decent may be configured locally as `8888`, `8989`, or another port. The
acceptance check is "Decent still works on its configured origin"; ssbsky still
defaults to `8990`.

## Decisions (resolved)

1. **Handles.** Keep SSB's existing petname/alias system as the display handle —
   collisions and all. No invented `@handle.domain` strings. Always-visible
   shortened pubkeys are the preferred disambiguator, with full-key click/copy
   affordance, but that is DOM/module work unless the existing markup already
   exposes a safe attribute for CSS to surface. Do not make pubkey display a
   hidden requirement of the CSS-only first cut.
2. **Banners.** Reuse Decent's existing `about.headerImage` extension and banner
   crop/upload UI. ssbsky should restyle the profile header around that field;
   it should not invent a second banner field.
3. **WebSocket port.** Same-origin for each UI. Decent uses its own configured
   HTTP/ws origin; ssbsky uses its own HTTP/ws origin. The shared helper appends
   websocket incoming configs and never clobbers Decent while adding ssbsky.
4. **Discover feed.** Chronological Public for v1, labeled "Discover." A
   plug-and-play feed-algorithm system (à la Bluesky's feed generators) is
   wanted eventually but is **low priority** — not in the first cuts.
5. **Dark mode.** In scope for v1. Follow the OS via
   `@media (prefers-color-scheme: dark)` over a CSS-variable palette (added in
   stage 3). No manual toggle needed initially.
6. **Build wiring.** Extend `decent/scripts/style.js` (it already copies
   `style.css` → build and writes the JSON fallback) to **also emit
   `ssbsky-style.css`** into the build dir, so the existing `npm run build:web`
   produces both stylesheets with nothing new to remember. Optionally add a thin
   `build:ssbsky` for a fast skin-only rebuild loop.
7. **Default launch/config.** ssbsky is enabled by default on `node bin.js start`.
   Use `config.ssbsky.host` and `config.ssbsky.port`, mirroring Decent's
   namespace. The default display spelling is lowercase `ssbsky`.
8. **Stage-3 rhetoric/copy.** ssbsky may rename UI labels to match Bluesky's
   product language when the behavior maps honestly. Do not change Decent's copy
   for this, and do not rename git/code into something misleading.
