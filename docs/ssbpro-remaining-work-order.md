# Work Order: Remaining ssbpro Professional Networking Work

**Audience:** Claude or another implementation agent.

**Repo:** `/Users/evbogue/Code/ssbc`

**App:** `ssbpro`, a professional-network skin of the shared Decent SSB web client.

**Local URL:** `http://127.0.0.1:8991/`

**Primary product principle:** ssbpro should help people improve and exchange a concise public SSB identity. Avoid adding structured resume fields or new social message types. Use existing SSB primitives:

- `about.name`
- `about.description`
- `about.image`
- `about.headerImage`
- public `contact` messages for subscribe/follow

## Current State

The first product slice is implemented.

Already done:

- ssbpro client/plugin exists and runs on port `8991`.
- ssbpro professional shell/layout exists in `decent/src/ssbpro-style.css`.
- Light/dark mode toggle exists in the top nav.
- Top-nav `Connect` button opens a unified modal with:
  - `My QR`
  - `Paste code`
  - copy profile code
  - copy profile link
  - download QR
  - paste-code preview and Subscribe action
- Self-profile action row is simplified to:
  - `Improve bio`
  - `Edit profile`
- `Improve bio` modal exists in `decent/src/modules/ui/avatar-profile.js`.
- Subscribe wording is ssbpro-only and still publishes normal `contact` messages.
- The profile fields remain compatible with other clients.

Important existing files:

- `plugins/ssbpro-ui.js`
- `decent/src/ssbpro-style.css`
- `decent/src/modules/core/app.js`
- `decent/src/modules/ui/avatar-profile.js`
- `decent/src/modules/ui/follow.js`
- `docs/ssbpro-professional-network-work-order.md`

## Important Constraints

- Do not add role, company, skills, location, or other structured profile fields.
- Do not add new profile message types for this work.
- Subscribe/connect must remain normal SSB follow/contact behavior:

```js
{
  type: 'contact',
  contact: '@feed.ed25519',
  following: true
}
```

- Do not auto-subscribe from QR or pasted codes. Always show a confirmation first.
- Keep changes ssbpro-only where possible. Decent and ssbski should remain behaviorally unchanged.
- Rebuild after frontend changes:

```sh
npm run build:web
```

## Status

Stages 1–5 are implemented and verified (desktop 1440×1000 and mobile 390×844):

- **Stage 1 — Connect payload + route:** done. Pure helpers in
  `decent/src/modules/ui/qr-connect.js` (`encode/decode/validate/buildConnectPayload`,
  `connectRouteFromText`); `#connect/<payload>` confirmation screen in
  `decent/src/modules/ui/connect-view.js`; QR/Connect link now encode the route.
- **Stage 2 — Duplicate subscribe guard:** done, via `follower_of` in both the
  connect route and the Network dashboard.
- **Stage 3 — Scan QR + image upload:** done. Third Connect tab; camera only on
  explicit "Start camera"; `jsqr` decodes uploads; polite camera-unavailable state.
- **Stage 4 — Network discovery tab:** done. `decent/src/modules/ui/network-discovery.js`
  (registered before `public.js`) renders people/bio cards for the ssbpro skin only.
- **Stage 5 — Bio-aware feed cards:** done. `message.js` shows a clamped author
  bio under the name on ssbpro post cards only.
- **Stage 6 — Tests/QA:** `test/qr-connect.js` covers encode/decode/validate and
  `connectRouteFromText`; manual QA performed via Playwright. Remaining: deeper
  cross-skin regression QA as desired.

The per-stage detail below is kept for reference.

## Remaining Work

### Stage 1 - Proper Connect Payload and Route

The current QR encodes a local profile link/hash. Replace or extend this with a proper portable connect payload and route.

Target route:

```text
#connect/<base64url-json>
```

Payload shape:

```json
{
  "v": 1,
  "type": "ssbpro-connect",
  "feed": "@feedkey=.ed25519",
  "name": "Display Name",
  "description": "Short bio",
  "image": "&blobhash=.sha256"
}
```

Required:

- `v`
- `type`
- `feed`

Optional, from existing profile/about data only:

- `name`
- `description`
- `image`

Do not include new structured fields.

Implementation guidance:

- Add pure helpers, ideally in a small module such as `decent/src/modules/ui/qr-connect.js` or another local helper:
  - `encodeConnectPayload(payload)`
  - `decodeConnectPayload(encoded)`
  - `validateConnectPayload(payload)`
- Validate feed ids with `ssb-ref.isFeed`.
- Keep the existing top-nav `Connect` modal, but make `My QR` encode the route payload.
- The route should render a confirmation card with avatar/name/bio/feed and a `Subscribe` button.
- If payload has no name/bio, fall back to locally known `api.avatar_name(feed)` and profile data when available.

Acceptance:

- QR decodes to an `ssbpro-connect` payload, not only a localhost URL.
- `#connect/<payload>` opens a confirmation screen/card.
- Invalid payloads show a safe error.
- Subscribe publishes one normal `contact` follow message only after user confirmation.

### Stage 2 - Duplicate Subscribe Guard

The paste-code and connect route should not publish duplicate follows when the viewer already subscribes to the feed.

Implementation guidance:

- Use existing relationship/follow checks where available.
- `decent/src/modules/ui/follow.js` uses `api.follower_of(self_id, id, cb)`.
- If already subscribed:
  - show `Subscribed`
  - disable the subscribe action or convert it to a profile link
  - do not publish another `contact` message

Acceptance:

- Pasting or opening a connect payload for an already-subscribed feed does not publish another follow.
- Unknown/not-subscribed feeds still show `Subscribe`.

### Stage 3 - Camera Scan QR and Image Upload Fallback

The current `Connect` modal has `My QR` and `Paste code`. Add scan capability without making camera permission happen on page load.

Implementation guidance:

- Add a third tab in the top-nav `Connect` modal:
  - `Scan QR`
- Only request camera after the user opens/selects `Scan QR`.
- Include a file/image upload fallback for QR images.
- If browser camera APIs are unavailable, show paste/upload fallback instead of failing hard.
- Decode into the same connect-payload validation path from Stage 1.

Acceptance:

- Camera permission is requested only after explicit user action.
- Camera-unavailable state is polite and useful.
- Image upload fallback can decode a QR image.
- Valid scan shows confirmation before subscribe.
- Invalid scan shows a safe error.

### Stage 4 - ssbpro Network Discovery Tab

The current `Network` route is still mostly inherited behavior. Turn it into a people/bio discovery dashboard for ssbpro.

Goal:

The Network tab should feel like finding people worth subscribing to, not another generic follow/friends list.

Suggested sections:

- `People you subscribe to`
- `People subscribed to you`
- `Active people`
- `Bio needs work` for self only if the viewer has no useful bio

Person card content:

- avatar
- name
- one or two lines of `about.description`
- relation state
- Subscribe/Subscribed
- Message
- View profile

Top-level action:

- Use the existing top-nav `Connect` as the primary QR/code action.
- Do not put multiple QR buttons back into the profile action row.

Implementation guidance:

- Add an ssbpro-only `screen_view('friends')` override or new module.
- Keep Decent/ssbski routes unchanged.
- Reuse existing SSB data APIs and relationship/follow state.
- Clamp bios cleanly.

Acceptance:

- Network tab shows people cards, not just a generic feed/list.
- Empty state points to improving bio and using Connect.
- No new message fields are required.
- Mobile layout is usable.

### Stage 5 - Bio-Aware Feed Cards

Make feed cards more legible as professional identity cards.

Task:

- In ssbpro only, show a short author bio snippet under the author name on post cards when available.

Implementation guidance:

- Likely file: `decent/src/modules/ui/message.js`.
- Use existing `about.description`.
- Clamp to one or two lines.
- Keep cards compact.
- Do not add new actions or fields.
- Do not change ssbski or Decent feed behavior.

Acceptance:

- ssbpro feed makes people more legible at a glance.
- Long bios clamp cleanly.
- Decent and ssbski feed cards are unchanged.

### Stage 6 - Tests and QA

Add focused tests where practical.

Recommended tests:

- `encodeConnectPayload` / `decodeConnectPayload` round trip.
- `validateConnectPayload` rejects malformed feed ids.
- `#connect/<payload>` rejects invalid payloads gracefully.
- ssbpro Subscribe labels do not affect Decent/ssbski.
- Bio analyzer covers:
  - missing bio
  - too-long bio
  - good-enough bio

Manual QA:

- Self profile with no bio.
- Self profile with long bio.
- Other profile not subscribed.
- Other profile already subscribed.
- Connect modal on desktop.
- Connect modal on mobile.
- QR display.
- Paste code.
- Connect route.
- Camera unavailable.
- Image upload QR decode.

## Suggested Implementation Order

1. Extract QR/connect helper functions and tests.
2. Implement `#connect/<payload>` route.
3. Update QR generation to encode the connect route.
4. Add duplicate subscribe guard.
5. Add camera scan/upload fallback.
6. Redesign ssbpro Network tab.
7. Add author bio snippets to ssbpro feed cards.
8. Update `docs/ssbpro-professional-network-work-order.md` to reflect that QR now lives in top-nav `Connect`, not as separate profile buttons.

## Verification Commands

Run at minimum:

```sh
npm run build:web
node test/pwa.js
git diff --check
```

If touching CLI/plugin behavior, also consider:

```sh
node test/bin.js
node test/builtin-plugins.js
```

Use Playwright/browser verification for UI work:

- desktop: `1440x1000`
- mobile: `390x844`

Check that:

- text does not overlap
- top nav controls remain usable
- modal overlays sit above fixed sidebars/topbar
- QR code canvas is nonblank
- subscribe confirmation appears before publishing

## Notes for Claude

The working tree may contain other uncommitted ssbpro changes. Do not revert unrelated files. Keep edits scoped and preserve existing Decent/ssbski behavior.

The current app is intentionally not a resume builder. The strongest next improvement is making Connect portable and real through `#connect/<payload>`, then building out Network discovery.
