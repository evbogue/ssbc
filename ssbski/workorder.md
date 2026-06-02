# ssbski — work order

A Bluesky-skinned fork of the Decent web client. Same SSB engine, same data,
same identity — a different skin, served on its own port.

> Status: **Stages 1–7 have all landed.** ssbski has its own same-origin UI
> server and a full Bluesky-style skin: CSS-variable palette + dark mode,
> flattened feed rows, compact action/reaction styling, ssbski-only
> Discover/Following/Chat copy, a fixed left rail with `attr()` labels and a
> "New Post" pill, a mobile bottom tab bar, themed profile/thread/compose, and
> the structural pieces that were once "decide later": a right-hand column
> (search + active people + footer links), in-feed Discover/Following tabs,
> profile follower/following/post counts, and always-visible shortened pubkeys.
> The remaining ideas (pluggable feed-algorithm generators) stay explicitly
> low-priority and out of scope. The bin.js test suite was also made robust to a
> running local instance (it no longer hardcodes ports), and `npm test` is green.

## Thesis

Decent stays exactly as it is. **ssbski** is an additive fork that reuses
Decent's working SSB engine and replaces only the presentation, to match the
look and interaction patterns of the Bluesky web client as closely as is
reasonable — *without* rebuilding it as a React/React-Native app.

The cheapest viable version is **"Decent's brain, Bluesky's skin"**: the exact
same JavaScript bundle Decent ships, served with a different stylesheet on a
second port. Structural pieces that CSS genuinely can't reach come later.

## Locked decisions

- **Name:** ssbski (yes, to be annoying).
- **Keep git/code.** The Code Activity and Repositories screens stay — Bluesky
  has no equivalent, and git-over-SSB is core to this project.
- **Keep emoji reactions.** Decent's reactions stay; we do not reduce to a
  Bluesky-style like-only model. They get restyled, not removed.
- **New port, not a route under Decent.** ssbski is served on its own port
  (e.g. 8990) so a subdomain can point straight at it. Decent is untouched.
- **Same origin for everything.** The ssbski origin serves HTML/CSS/JS, blobs,
  git HTTP routes, docs, and the websocket remote. Do not make the browser
  connect cross-origin to Decent's websocket port.
- **Launch by default.** There is no feature flag for the first cut:
  `node bin.js start` should start Decent and ssbski in the same process.
- **Config namespace:** ssbski mirrors Decent's config shape with
  `ssbski.host` and `ssbski.port`. Defaults are `127.0.0.1` and `8990`.
- **Maximize reuse of Decent's JS.** No framework rewrite. Ideally zero JS
  changes for the first shippable cut.
- **Use Bluesky-ish language where the mapping is honest.** In the ssbski skin,
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
- Rename ssbski-visible labels where the SSB behavior maps cleanly:
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

- ssbski = **Decent's exact JS bundle** (`decent/build/index.html`) + a
  different stylesheet (`ssbski-style.css`), served by the sbot on a second
  port. Same-origin injected ws remote → same identity, same data, runs alongside
  Decent.
- Do **not** copy-paste `plugins/decent-ui.js` wholesale. Extract the shared
  HTTP/static/ws/git/blob/doc serving machinery into a small helper module, then
  have `plugins/decent-ui.js` and `plugins/ssbski-ui.js` call it with different
  options:
  - plugin name / log prefix
  - config namespace (`decent` vs `ssbski`)
  - default/configured port (Decent's configured port vs ssbski's default `8990`)
  - stylesheet href (`/style.css` vs `/ssbski-style.css`)
  - launch message
- `plugins/ssbski-ui.js` should be a thin wrapper around that helper, not a
  second divergent implementation of blob uploads, git routes, docs routes,
  path validation, content types, or websocket remote derivation.
- The build step compiles/copies only the new CSS. The JS bundle remains the
  Decent bundle.
- The ssbski HTTP server must expose the same same-origin surface Decent exposes:
  `/`, `/style assets`, `/blobs/add`, `/blobs/get/:hash`, `/git/*`, `/docs/*`,
  and websocket upgrade on the ssbski port. The frontend already builds blob and
  git URLs from `window.location.origin`, so a "static-only ssbski server" is
  not sufficient.
- `plugins/ssbski-ui.js` should be registered in `bin.js` before `ssb-ws`, the
  same as `plugins/decent-ui.js`, so both UI helpers append their websocket
  server entries before `ssb-ws` builds the multiserver listeners.

### Implementation hazards to handle deliberately

1. **The built HTML already links `/style.css`.**
   `decent/scripts/postprocess-index.js` inserts hardcoded Decent stylesheet
   links into `decent/build/index.html`. `plugins/decent-ui.js` only injects a
   stylesheet when the HTML does not already contain one, so ssbski cannot rely
   on "extra injection" alone.

   **Solution:** when serving `index.html` for ssbski, rewrite the preload and
   stylesheet links from `/style.css` to `/ssbski-style.css` before sending the
   response. Keep Decent's served HTML unchanged. A second generated
   `ssbski-index.html` is acceptable if that ends up cleaner, but the first
   cut should prefer a small server-side rewrite so the JS build stays single.

2. **The inline fallback stylesheet check is substring-based.**
   `decent/src/modules/core/app.js` only recognizes an external stylesheet
   whose href contains `style.css`; otherwise it injects Decent's inline CSS
   fallback from `style.css.json` and the skins fight.

   **Solution:** keep the ssbski filename as `ssbski-style.css`. It contains
   the `style.css` substring, so the existing fallback check sees it and does
   not inject Decent's inline CSS. Do not rename it to something like
   `ssbski.css` unless the app fallback logic is also changed.

3. **The websocket server config must be additive.**
   Current Decent startup attaches its HTTP server to
   `config.connections.incoming.ws`. ssbski needs its own websocket listener on
   the ssbski HTTP server so the injected remote can be same-origin
   (`ws://127.0.0.1:8990~shs:<key>` locally, `wss://ssbski.example~shs:<key>`
   behind HTTPS).

   **Solution:** the shared helper should append a ws incoming config for each
   UI HTTP server while preserving existing entries. Do not replace Decent's ws
   entry when adding ssbski. If repeated init needs dedupe, dedupe by the exact
   `server` object or port. Confirm this against `ssb-ws`, which supports
   multiple ws servers.

   **Stage-2 gotcha:** preserve Decent's historical fallback from `decent.port`
   to `config.ws.port`, but do not let ssbski inherit `config.ws.port` by
   accident. If `ssbski.port` is unset, ssbski should default to `8990`, not the
   global websocket port (`8989` in the local default config). The helper now has
   an explicit `useWsPortFallback` option: Decent opts into the legacy fallback,
   and ssbski should leave it off.

4. **Same-origin behavior is the first thing to verify.**
   `8990` is a different origin from Decent, but ssbski itself must be internally
   same-origin: page, websocket, blobs, git, and docs all served from the ssbski
   origin. Production subdomain proxying should forward websocket upgrades to the
   ssbski server, not to Decent's port.

   **Solution:** Stage 2 must verify identity and feed loading from
   `http://127.0.0.1:8990/` before any serious CSS work lands. Inspect the
   logged `ssbski-ui ws remote:` value and confirm it points at the ssbski
   origin. Behind the intended proxy, confirm `x-forwarded-host` /
   `x-forwarded-proto` produce `wss://<ssbski-subdomain>~shs:<key>`.

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
2. **DONE: Serve ssbski on its own port** with a near-empty `ssbski-style.css` — prove
   the second-port + same-origin ws remote + identity path end to end against
   the live sbot. Confirm Decent still loads in the same process. ssbski is
   default-on, uses `ssbski.host` / `ssbski.port`, and defaults to
   `http://127.0.0.1:8990/`. The stage-2 stylesheet may include tiny placeholder
   or structural CSS, but should not attempt the full visual theme yet.
3. **DONE: Base theme:** palette **(on CSS variables)**, type, flatten post rows,
   action-row restyle. Add the `prefers-color-scheme: dark` override here so
   dark mode ships with the base theme. Also land safe ssbski-only language
   changes: Public → Discover, Friends → Following, Private → Chat/DMs, while
   keeping git/code explicit. Emoji reactions remain visible and are styled as
   compact reaction/action affordances, not hidden behind a like-only fiction.
4. **DONE: Left rail:** navbar re-anchored to a fixed left rail with `attr()`
   labels and a relocated "New Post" pill (collapses to an icon strip below
   1300px).
5. **DONE: Mobile bottom tab bar:** the `max-width: 600px` media query re-pins
   the rail to the bottom and turns "New Post" into a floating action button.
6. **DONE: Profile / thread / compose-modal** theming, plus a Bluesky-faithful
   git-forge skin.
7. **DONE (structural):** right column (search + "Active people" + footer
   links); in-feed Discover/Following tabs; profile header with
   follower/following/post counts over Decent's existing `about.headerImage`
   field; always-visible shortened pubkeys in post/profile headers. The only
   deferred piece is the pluggable feed-algorithm generator system, which stays
   **low priority** per Decision 4 below.

All stages shipped. The CSS-only ambition expanded into modest, surgical JS/DOM
additions (`decent/src/modules/core/app.js`, `decent/src/modules/ui/message.js`,
`decent/src/modules/ui/avatar-profile.js`) for the structural stage-7 items,
while Decent itself stayed untouched.

## First-cut acceptance criteria

- `node bin.js start` serves Decent at its configured port.
- The same process serves ssbski by default at `http://127.0.0.1:8990/`, unless
  overridden via `ssbski.host` / `ssbski.port`.
- Both origins inject a working same-origin `window.PATCHBAY_REMOTE` for the
  same sbot identity: Decent points at the Decent origin, ssbski points at the
  ssbski origin.
- Decent loads `/style.css`; ssbski loads `/ssbski-style.css`; ssbski does not
  also inject the inline Decent fallback CSS.
- Blob upload/get routes, docs routes, and git HTTP routes work from both
  Decent and ssbski after the shared-helper refactor.
- `npm run build:web` still produces the existing Decent bundle.
- `npm test` passes before commit.

Note: Decent may be configured locally as `8888`, `8989`, or another port. The
acceptance check is "Decent still works on its configured origin"; ssbski still
defaults to `8990`.

## Decisions (resolved)

1. **Handles.** Keep SSB's existing petname/alias system as the display handle —
   collisions and all. No invented `@handle.domain` strings. Always-visible
   shortened pubkeys are the preferred disambiguator, with full-key click/copy
   affordance, but that is DOM/module work unless the existing markup already
   exposes a safe attribute for CSS to surface. Do not make pubkey display a
   hidden requirement of the CSS-only first cut.
2. **Banners.** Reuse Decent's existing `about.headerImage` extension and banner
   crop/upload UI. ssbski should restyle the profile header around that field;
   it should not invent a second banner field.
3. **WebSocket port.** Same-origin for each UI. Decent uses its own configured
   HTTP/ws origin; ssbski uses its own HTTP/ws origin. The shared helper appends
   websocket incoming configs and never clobbers Decent while adding ssbski.
4. **Discover feed.** Chronological Public for v1, labeled "Discover." A
   plug-and-play feed-algorithm system (à la Bluesky's feed generators) is
   wanted eventually but is **low priority** — not in the first cuts.
5. **Dark mode.** In scope for v1. Follow the OS via
   `@media (prefers-color-scheme: dark)` over a CSS-variable palette (added in
   stage 3). No manual toggle needed initially.
6. **Build wiring.** Extend `decent/scripts/style.js` (it already copies
   `style.css` → build and writes the JSON fallback) to **also emit
   `ssbski-style.css`** into the build dir, so the existing `npm run build:web`
   produces both stylesheets with nothing new to remember. Optionally add a thin
   `build:ssbski` for a fast skin-only rebuild loop.
7. **Default launch/config.** ssbski is enabled by default on `node bin.js start`.
   Use `config.ssbski.host` and `config.ssbski.port`, mirroring Decent's
   namespace. The default display spelling is lowercase `ssbski`.
8. **Stage-3 rhetoric/copy.** ssbski may rename UI labels to match Bluesky's
   product language when the behavior maps honestly. Do not change Decent's copy
   for this, and do not rename git/code into something misleading.
