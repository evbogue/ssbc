# ssbsky — work order

A Bluesky-skinned fork of the Decent web client. Same SSB engine, same data,
same identity — a different skin, served on its own port.

> Status: planning. Nothing here is built yet. This document is the agreed
> shape of the work before any code lands.

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
- **Maximize reuse of Decent's JS.** No framework rewrite. Ideally zero JS
  changes for the first shippable cut.

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
- **Left rail:** the top `.navbar` is flexbox — re-anchor it to a fixed
  vertical rail (`flex-direction: column`, fixed left, push `.screen__content`
  over with `margin-left`) and pull labels in with `attr()`.
- **Mobile bottom tab bar:** a media query re-pins that same navbar to the
  bottom; the icon-only nav is already shaped like a tab bar.
- Reposition the compose FAB / inline prompt into a rail "New Post" button.
- Profile, thread, and the compose modal: recolor and reflow.

### Needs DOM / module work (CSS cannot do these)

- **Right-hand discover column** (search + suggested follows + trends) — that
  content and data does not exist in the DOM at all.
- **In-feed Following / Discover tabs** — Decent's Public and Friends are
  separate routes, not one tabbed timeline. Merging them is structural.
- **Profile banner + follower/following/post counts** in Bluesky's header
  layout — partial via CSS, but the banner field and counts need data wiring.
- Quote-embeds-as-cards, share sheet, feeds/lists — feature-level.

## Architecture

- ssbsky = **Decent's exact JS bundle** (`decent/build/index.html`) + a
  different stylesheet (`ssbsky-style.css`), served by the sbot on a second
  port. Same injected ws remote → same identity, same data, runs alongside
  Decent.
- New plugin `plugins/ssbsky-ui.js` (or parametrize `plugins/decent-ui.js`)
  serves the existing build but injects `ssbsky-style.css` in place of
  `style.css`. The build step compiles only the new CSS.

### Known gotcha to design around

`decent/src/modules/core/app.js` (~line 9) only recognizes an external
stylesheet whose href contains the substring `style.css`; otherwise it injects
Decent's inline CSS fallback (from `style.css.json`) and both skins fight.

**Mitigation:** name the file so it matches the substring (e.g.
`ssbsky-style.css` contains `style.css`), or have the plugin suppress the
inline fallback. Cheap, but must be handled deliberately.

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

1. **Serve ssbsky on its own port** with a near-empty stylesheet — prove the
   second-port + ws-remote + identity path end to end against the live sbot.
2. **Base theme:** palette, type, flatten post rows, action-row restyle.
3. **Left rail:** reposition navbar + `attr()` labels + "New Post" button.
4. **Mobile bottom tab bar:** media query.
5. **Profile / thread / compose-modal** theming.
6. *(structural, later)* Right discover column; unified Following/Discover
   timeline tabs; profile banner + counts.

Recommendation: ship stages 1–5 (the CSS-only fork) as the first cut, get it on
the subdomain, then decide whether stage 6 is worth the structural cost.

## Open questions

1. **Handles.** Bluesky shows `@handle.domain`; SSB has only non-unique
   `about` names + pubkeys. Render display name + a derived handle (`@name` or
   `@first8ofkey`)? Affects every post header's fidelity.
2. **Banners.** SSB `about` has an avatar but no banner field by convention.
   Skip banners in v1, or introduce a custom `about` banner field?
3. **Second-origin ws.** A new port is a different origin — confirm `ssb-ws`
   accepts the connection and the subdomain proxy forwards the ws remote
   correctly (the plugin derives remote from `x-forwarded-host`). Verify early.
4. **Discover feed.** Bluesky's Discover is algorithmic; we map it to
   chronological Public. Confirm that expectation is acceptable.
5. **Dark mode.** Bluesky ships dim/dark themes. In scope for v1 or later?
6. **Build wiring.** Add a `build:ssbsky` script (CSS-only) or fold it into
   `build:web`?
