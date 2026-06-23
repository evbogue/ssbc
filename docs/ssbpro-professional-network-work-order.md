# Work Order: ssbpro Bio Improvement Platform

> **Status (implemented):** The QR / identity-exchange UI no longer lives as
> separate buttons on the self profile. It is a single top-nav **Connect**
> button that opens a modal with three tabs — **My QR**, **Paste code**, and
> **Scan QR** (camera + image-upload fallback, camera requested only on
> explicit action). QR codes encode a portable `#connect/<payload>`
> (`ssbpro-connect`) route that renders an avatar/name/bio/feed confirmation
> card with **Subscribe** (a normal `contact` follow, guarded against
> duplicates). The Network tab is a people/bio discovery dashboard, and feed
> cards show a short author bio under the name. See
> `docs/ssbpro-remaining-work-order.md` for the per-stage breakdown. The
> sections below are the original design intent and may describe earlier
> placements (e.g. profile-level QR buttons) that have since moved into Connect.

**Skin:** ssbpro only, served by `plugins/ssbpro-ui.js` on port `8991`.

**Intent:** Make ssbpro feel like a lightweight professional presence and bio-improvement app, not a giant profile form. The core product is: write a better short bio, see how it looks in the network, share it quickly, and subscribe/connect with people through QR codes.

Avoid adding a pile of new message types or profile fields. Use the existing SSB primitives:

- `about.name`
- `about.description`
- `about.image`
- `about.headerImage`
- public `contact` messages for following/subscribing

Unknown/new `about` fields should be avoided unless a later user need is obvious.

## Product Direction

ssbpro should answer one clear question:

> "How do I present myself well enough that someone knows why to follow me?"

This means the product should optimize for:

- a strong name + photo + short bio
- fast iteration on bio wording
- previewing how the bio appears in cards, search, QR connect, and profile pages
- lightweight subscribe/connect mechanics
- simple network discovery based on people and bios, not resumes

The reference is professional networking behavior, not resume-building. Most people do not fill out long structured fields anymore; they maintain a recognizable identity, a concise bio, and a way to be contacted.

## Current State

ssbpro currently has:

- Feed / Network / Messaging labels
- a three-column professional-ish shell
- profile cards with name, handle, bio, banner, avatar, posts, followers, and following
- follow/unfollow actions through `contact` messages
- profile editing in `decent/src/modules/ui/avatar-profile.js`

The biggest gap is not missing structured profile fields. The gap is that editing a bio does not feel guided, useful, or shareable.

## Core Experience

### 1. Improve My Bio

Self profile should have a clear primary action:

- `Improve bio`

This opens a focused editor, not a large form.

The editor should include:

- current display name
- current bio textarea
- live character count
- preview card
- tone chips:
  - Clear
  - Warm
  - Technical
  - Founder
  - Hiring
  - Local
- quick transforms:
  - Shorten
  - Make clearer
  - Make warmer
  - Make more specific
  - Remove buzzwords
- optional prompt field:
  - `What should people know about you?`

First version can ship without AI/API calls. Use local heuristics and templates:

- trim filler
- cap bio length
- split long text into a crisp first sentence
- suggest adding what you do, who you help, or what you are looking for
- show examples

Later, this can integrate an LLM, but the UX should work without it.

### 2. Bio Preview Everywhere

The user should see exactly how the bio appears in:

- profile header
- feed author hover/card
- Network people card
- QR connect confirmation card
- search result

This makes the platform feel useful immediately: editing is tied to outcomes.

### 3. QR Subscribe / Connect

Keep the QR idea, but frame it as lightweight subscription/contact exchange:

- `Show my QR`
- `Scan QR`
- `Subscribe`
- `Subscribed`

Under the hood, subscribe/connect is still:

```js
{
  type: 'contact',
  contact: '@feed.ed25519',
  following: true
}
```

The UI can say "Subscribe" or "Connect"; choose one and use it consistently in ssbpro. Recommendation: use **Subscribe** because it maps honestly to one-way SSB following and avoids promising mutual friendship.

## Visual Feel

ssbpro should feel calm, editorial, and professional:

- profile/bio first
- less social-noise, fewer counters
- short labels
- compact cards
- clear preview surfaces
- 8px radius
- restrained blue accents
- no resume-builder field jungle

Use the existing palette:

- Primary: `#0a66c2`
- Page background: `#f4f2ee`
- Surface: `#ffffff`
- Border: `#d9d2c6`
- Text: `#1f2328`
- Muted: `#5f6f7a`

## Information Architecture

### Feed

Purpose: see updates from people and understand who they are.

Keep:

- `Feed`
- composer
- post cards

Improve:

- Author row should emphasize name + short bio snippet.
- Reduce extra social controls in ssbpro if they feel noisy.
- Use action copy:
  - Reply
  - React
  - Share
  - Save

Do not add professional fields to feed cards. Use existing `about.description`.

### Network

Purpose: find people worth subscribing to.

Replace generic "Following" behavior in ssbpro with a simple bio-discovery dashboard:

- `People you subscribe to`
- `People subscribed to you`
- `Active people`
- `Bio needs work` for self only, if own bio is missing or too vague

Person cards should show:

- avatar
- name
- one or two lines of bio
- relation state
- Subscribe / Subscribed
- Message
- View profile

Top actions:

- Show my QR
- Scan QR
- Paste profile code

### Messaging

Purpose: talk after subscribing.

Keep current private messaging work, but use professional copy:

- `Messaging`
- `No messages yet`
- `Message` action from profile/person card

### Profile

Purpose: present a clear bio and let the owner improve it.

Do not add structured fields like role, company, location, skills, etc. for this version.

Profile header should prioritize:

- avatar
- banner
- display name
- short feed id/copy button
- bio
- Subscribe/Subscribed or Message actions
- Show QR for self
- Improve bio for self

Stats can stay, but make them secondary:

- Posts
- Subscriptions
- Subscribers

Use `Subscriptions` / `Subscribers` instead of `Following` / `Followers` in ssbpro if possible.

## Bio Improvement UX

### Bio Quality Checks

Add a small local analyzer for `about.description`.

Signals:

- Missing bio
- Too short to explain anything
- Too long for cards
- Starts with vague filler
- Contains too many hashtags/links
- No concrete noun/verb signal
- Looks like a raw feed id or placeholder

Suggested status:

- `Looks good`
- `Could be clearer`
- `Too long for cards`
- `Add what you do`
- `Add what you are looking for`

Keep this non-judgmental. The UI should feel helpful, not scolding.

### Suggested Bio Patterns

Offer templates that fill only the existing `description` field:

- `I build ___ for ___.`
- `Working on ___, interested in ___.`
- `Independent ___ focused on ___.`
- `Writing about ___ and learning ___.`
- `Local to ___, open to ___.`

Templates should insert text into the bio editor, not create new fields.

### Preview Card

Show a live card:

```text
[avatar] Display Name
Short bio preview over one or two lines.
Subscribe
```

Also show a compact QR confirmation preview:

```text
Scan result
Display Name
Short bio
@feed…
[Subscribe]
```

This makes the user understand why concise bio writing matters.

## QR Subscribe Flow

### Goal

Let two people exchange SSB identities in person with a QR code and one confirmation tap.

The QR should represent a profile/subscription target, not a huge profile payload.

### Route

```text
/#connect/<base64url-json>
```

The route can remain `connect` even if the button says Subscribe.

### Payload

Keep it minimal:

```json
{
  "v": 1,
  "type": "ssbpro-connect",
  "feed": "@feedkey=.ed25519",
  "name": "Display Name",
  "description": "Short bio",
  "image": "&blobhash=.sha256",
  "remote": "optional ws remote",
  "invite": "optional invite code"
}
```

Required:

- `v`
- `type`
- `feed`

Optional:

- `name`
- `description`
- `image`
- `remote`
- `invite`

Do not include role, organization, skills, location, or other structured profile fields.

### Safety

- Validate `feed` with `ssb-ref.isFeed`.
- Do not auto-subscribe after scan.
- Show confirmation first.
- If `invite` or `remote` is present, explain that it may connect to a peer.
- Camera permission should only be requested after the user clicks Scan QR.

### Display

`Show my QR` modal:

- avatar
- name
- bio
- QR code
- Copy profile code
- Copy profile link
- Download QR

`Scan QR` modal:

- camera scanner if available
- upload image fallback
- paste code fallback
- confirmation card
- Subscribe button

## Implementation Plan

### Stage 1 - ssbpro Copy and Subscribe Semantics

Files:

- `decent/src/modules/ui/follow.js`
- `decent/src/modules/ui/avatar-profile.js`
- `decent/src/modules/ui/public.js`
- `decent/src/ssbpro-style.css`

Tasks:

- In ssbpro only, label follow actions as Subscribe/Subscribed.
- Rename follower/following stats to Subscribers/Subscriptions in ssbpro.
- Keep published messages unchanged.
- Add `Improve bio` and `Show QR` buttons to self profile.

Acceptance:

- Decent and ssbski still say follow/following.
- ssbpro says Subscribe/Subscribed.
- Clicking Subscribe publishes the same `contact` message.

### Stage 2 - Focused Bio Editor

Files:

- new `decent/src/modules/ui/bio-editor.js`, or extend `avatar-profile.js`
- `decent/src/modules/ui/index.js`
- `decent/src/ssbpro-style.css`

Tasks:

- Build an ssbpro-only bio editor modal.
- Reuse existing avatar/name/banner editing where possible, but keep this flow focused on name + bio.
- Add live preview card.
- Add character count and quality status.
- Add local templates/transforms.
- Publish `about` with `name` and `description`.

Acceptance:

- User can improve and save bio without touching extra fields.
- Saved bio appears on profile and cards.
- Empty and overlong bios show useful guidance.

### Stage 3 - Bio Discovery Network Tab

Files:

- new `decent/src/modules/ui/network.js`
- `decent/src/modules/ui/index.js`
- `decent/src/modules/ui/relationships.js`
- `decent/src/ssbpro-style.css`

Tasks:

- Add ssbpro-only `screen_view('friends')`.
- Show people cards based on existing follow graph and recent activity.
- Each card uses avatar, name, and `about.description`.
- Add Subscribe, Message, View profile.
- Add a self card prompting bio improvement if missing.
- Add Show my QR / Scan QR card.

Acceptance:

- Network tab feels like people discovery, not another post feed.
- No new message fields are required.
- Empty state points to improving your bio and sharing QR.

### Stage 4 - QR Generation

Files:

- new `decent/src/modules/ui/qr-connect.js`
- `decent/src/modules/ui/index.js`
- `package.json`
- `npm-shrinkwrap.json`
- `decent/src/ssbpro-style.css`

Tasks:

- Add QR generation dependency.
- Generate minimal connect payload from existing profile data.
- Render `Show my QR` modal.
- Add copy/download controls.

Acceptance:

- QR decodes to `ssbpro-connect`.
- Payload includes only feed id plus optional existing name/bio/image.
- QR is scannable from another device.

### Stage 5 - QR Scan and Subscribe

Files:

- `decent/src/modules/ui/qr-connect.js`
- `decent/src/modules/ui/invite.js`
- `decent/src/ssbpro-style.css`

Tasks:

- Add `#connect/<payload>` route.
- Decode and validate payload.
- Render confirmation card.
- Publish `contact` follow only after Subscribe click.
- Add camera scan, image upload, and paste fallback.

Acceptance:

- Invalid QR shows a safe error.
- Valid QR shows name/bio preview before action.
- Subscribe publishes one follow message.
- Already-subscribed state does not publish duplicates.

### Stage 6 - Bio-Aware Feed Cards

Files:

- `decent/src/modules/ui/message.js`
- `decent/src/ssbpro-style.css`

Tasks:

- Show author bio snippet under name in ssbpro post cards when available.
- Keep the card compact.
- Avoid adding new actions or fields.

Acceptance:

- Feed makes people more legible.
- Long bios clamp cleanly.
- ssbski feed behavior is unchanged.

### Stage 7 - Tests and QA

Tests:

- QR encode/decode validation.
- ssbpro Subscribe label does not affect Decent/ssbski.
- `#connect/<payload>` rejects malformed feed ids.
- Bio quality helper covers missing, too long, and good-enough bios.

Manual QA:

- Self profile with no bio.
- Self profile with long bio.
- Other profile not subscribed.
- Other profile already subscribed.
- QR display.
- QR paste route.
- Mobile Network tab.
- Camera unavailable.

## Suggested Module Shape

```text
decent/src/modules/ui/bio-editor.js
  gives:
    bio_editor_button
    bio_editor_modal
  needs:
    avatar_image
    avatar_name
    message_confirm

decent/src/modules/ui/qr-connect.js
  gives:
    screen_view
    qr_connect_button
    qr_connect_modal
  needs:
    avatar_image
    avatar_name
    blob_url
    message_confirm
    invite_accept
    sbot_gossip_connect
```

Pure helpers worth testing:

- `analyzeBio(text)`
- `applyBioTransform(text, transformName)`
- `encodeConnectPayload(payload)`
- `decodeConnectPayload(encoded)`
- `validateConnectPayload(payload)`

## Recommended First Slice

Build the smallest thing that changes the feel:

1. ssbpro says Subscribe/Subscribed instead of Follow/Following.
2. Self profile has `Improve bio`.
3. Improve bio opens a focused modal with textarea, preview, and 3-5 local suggestions.
4. Save publishes ordinary `about.description`.
5. Self profile has `Show QR`.
6. QR payload includes only feed, name, description, image.
7. `#connect/<payload>` shows a confirmation card and Subscribe button.

This keeps the product sharp: ssbpro becomes a place to make your public SSB identity understandable and easy to exchange, without turning into a profile-field tax.
