# Work Order: Git author identity via SSB self-claim

**Status:** Ready
**Depends on:** none strictly, but `git-ui-polish-work-order.md` should land first so author slots exist on tree/log/commit/blame screens to plug into.
**Intent:** Let Decent display a commit's author as the SSB identity that authored it, using self-claim messages and the viewer's follow graph. This is the foundational layer for every later "who actually made this change" feature. It is read-only from the git side — commits are not re-written, and SSH signing is **not** in scope here.

## Why this problem needs solving

Git commits carry an author `Name <email>` that is free-form and unverified. On SSB, identity is an ed25519 feed key. When a user pushes commits authored by several people to a repo hosted on somebody else's feed (a common case — @alice pushes to @bob's ssbc server), Decent currently shows only the raw email.

We want: given a commit's author email, resolve it to an SSB feed — preferring feeds the viewer follows, with a visible trust indicator so the viewer knows *why* a name is displayed. No central authority, no gatekeeper.

This work order implements **Layer 1** of the multi-layer strategy agreed in conversation:

- **Layer 1 (this work order):** self-claim via `type: git-identity` SSB messages, resolved through the viewer's follow graph.
- Layer 2 (future): SSH-signed commits with SSB keys as signers, surfacing a "Verified" badge.
- Layer 3 (future): pusher attestation — the pushing feed asserts per-commit authorship.
- Layer 4 (future): repo-scoped author maps curated by the repo owner.

Nothing in this work order should close the door on Layers 2–4. The trust-source display slot designed here is the hook later layers will upgrade.

## Trust model

Any feed can publish a `git-identity` claim for any email. Claims are therefore **untrusted by default**. The UI resolves a commit email like this, in order:

1. Is there exactly one claim by a feed the **viewer follows directly**? → display that feed. Trust tier: **known**.
2. Otherwise, is there a claim by a feed in the viewer's **friend-of-friend graph** (`sbot_friends_hops` ≤ 2)? → display that feed, disambiguate if more than one by preferring the closest hop, then earliest claim. Trust tier: **extended**.
3. Otherwise, is there any claim at all? → display the claimed feed but mark it **self-claimed**.
4. Otherwise → display the raw `Name <email>` from the commit. Trust tier: **unverified**.

The tier is always visible next to the author in the UI (small icon + tooltip). The viewer should never be misled into thinking a name is stronger evidence than it is.

When multiple follows claim the same email: show them all in the tooltip, but use the one with the earliest `timestamp` for the primary display. The viewer can click through to see every claim.

Claims are additive. A feed can publish several `git-identity` messages over time; the most recent message from that feed wins for that feed's claim set. (The client does the "latest per-feed wins" merge.)

## Message schema

New type: `git-identity`.

```
{
  type:      'git-identity',
  emails:    ['ev@evbogue.com', 'ev@example.com'],
  names:     ['Ev Bogue', 'evbogue'],     // optional display aliases
  revokes:   ['ev-old@example.com']        // optional, emails no longer claimed
}
```

Rules:

- `emails` is required and non-empty. Each entry is a plain email string, lowercased on write and on read. Do not validate the local part beyond "contains @".
- `names` is optional. If absent, the viewer falls back to the feed's `about.name`.
- `revokes` is optional. If present, those emails are subtracted from this feed's claim set as of this message's sequence number. A later re-add (a new `git-identity` message with the email back in `emails`) is allowed.
- Messages are public. No private variant in this layer.
- A feed may publish many `git-identity` messages. The indexer computes the feed's claimed-email set as `union(emails across all messages) - union(revokes across all messages, applied in sequence order)`.

Document the schema in `docs/api.md` under a new section "git-identity message". Example message, publish command, and read path.

## Where the work lives

- **Indexer / resolver:** new file `decent/src/modules/git/identity.js`. Exports a depject module with the lookup API below.
- **Message publishing:** a profile-page affordance that uses `api.message_compose` — see `decent/src/modules/git/git-browser.js` around line 451 for an example of `message_compose` in use.
- **Display:** edit `git-browser.js` and `git-activity.js` (and any other place that renders an author — grep for `c.author`, `author.email`, `author.name`). Route every author render through a shared `renderAuthor(authorObj, repoId)` helper that lives in `identity.js`.
- **SSB reads:** use `sbot_messagesByType({type: 'git-identity', ...})` and `sbot_friends_hops`. Do not use `sbot_query`. See `decent/src/modules/git/git-explore.js:60` for an example.

## Indexer design

In `identity.js`:

- On module load, subscribe to `sbot_messagesByType({type: 'git-identity', live: true, old: true})`. Build an in-memory map:

```
emailClaims: Map<email, Array<{feedId, messageKey, timestamp, sequence}>>
feedClaimedEmails: Map<feedId, Set<email>>
```

- When a new message arrives, apply it to both maps. A `revokes` list removes the email from `emailClaims[email]` for that feed, and from `feedClaimedEmails[feedId]`.
- Also subscribe to `sbot_friends_hops` once and keep the current hops map. Treat "I follow you" as hops=1, FOAF as hops=2. Anything >2 is "stranger" for this layer.
- Expose a synchronous `resolveCommitAuthor({name, email})` that returns:

```
{
  feedId:       string | null,
  displayName:  string,
  tier:         'known' | 'extended' | 'self-claimed' | 'unverified',
  allClaims:    Array<{feedId, displayName}>  // for tooltip
}
```

- Expose `onReady(cb)` so screens can wait for the first batch of claims to be indexed before first render. First-paint race: if the indexer hasn't finished initial catch-up when a screen renders, show the raw email and re-render the author slot once the indexer fires `ready`.

## Display helper

`identity.js` also exports `renderAuthor(commit.author)` which returns a DOM node. The node structure:

```
<span class="git-author git-author-<tier>">
  <img class="git-author-avatar" src="<blob url or gravatar fallback>">
  <a class="git-author-name" href="#<feedId>">Display Name</a>
  <span class="git-author-trust" title="<human-readable explanation>">
    <span class="material-symbols-outlined">verified | person | help</span>
  </span>
</span>
```

Tier-to-icon mapping:

- `known` → `verified` icon, greenish colour, tooltip "Follows: @yourfollow claims this email".
- `extended` → `person` icon, neutral blue, tooltip "Friend-of-friend: @somebody claims this email".
- `self-claimed` → `help` icon, grey, tooltip "Unknown feed @feedid claims this email".
- `unverified` → no icon, just the raw `Name <email>` from the commit.

Clicking the name goes to the profile page for that feed. If the tier is `unverified`, the name is not a link — it is just text.

Apply this helper every place a commit author is rendered:

- `git-browser.js:renderCommitRow` (log list)
- `git-browser.js:renderCommitScreen` (single commit page)
- `git-browser.js:renderTreeScreen` (latest-commit banner, if the UI-polish work order has landed)
- `git-browser.js:renderBlobScreen` (if/when blame ships — not in this WO, but leave a slot)
- `git-activity.js` (repo activity feed)

Grep for every call that builds an author `<span>` or `<a>` from `c.author`/`author.name`/`author.email` and replace it with `renderAuthor`.

## Publishing UI

A user needs a way to publish their own `git-identity` message. Minimum viable UX:

- On the profile page (`decent/src/modules/`… grep for the profile page file), add a new section **"Git identities"** below the main profile header.
- Section shows:
  - The emails currently claimed by the viewed feed (computed from the indexer).
  - If viewing your own profile: an input row with an email field and an "Add email" button. Pressing it calls `message_compose({type: 'git-identity', emails: [...existing, newEmail.toLowerCase()]})` and refreshes.
  - A small **×** next to each email on your own profile that publishes a revocation (`{type: 'git-identity', emails: [...without it], revokes: [thatEmail]}`).
- On first-time setup: when a user opens the Git tab and has zero `git-identity` claims, show a yellow banner: "Decent doesn't know which git commits are yours. Tell it which email addresses you use → Claim a git email." Link goes to the profile's git-identities section.

Copy should be plain. Do not oversell verification — this is a **claim**, not a proof.

## Performance notes

- The claim volume will be small (order of one message per user per email). Keep the whole index in memory. No SQL joins needed.
- `resolveCommitAuthor` is called once per commit row. Keep it O(1) via the `emailClaims` map. Do not traverse the hops graph per call — resolve hop membership once on each hops-map update and cache as a `Set<feedId>`.
- On first load, the log view can render dozens of authors. Render the raw email first, then swap in the resolved author once the indexer is ready. Use a single `requestAnimationFrame` batch for the swap.

## Non-goals for this work order

- **No SSH signature verification.** That is Layer 2 and needs a helper command (`ssbc git setup-signing`) plus allowed-signers derivation. Separate work order.
- **No pusher attestation.** Layer 3. Separate.
- **No repo-scoped author maps.** Layer 4. Separate.
- **No rewriting git history.** Commits remain as they are on disk.
- **No blocking a commit from rendering because its author is unverified.** Everything still shows; trust tier is an annotation, not a gate.
- **No email verification via nonce.** A claim is a claim. The follow graph is the trust substrate.
- **No UI for reviewing others' claims about you.** If someone else claims your email, your feed's claim still wins for your followers. A "dispute my claimed email" UI is out of scope.

## Testing

Add a test under `test/` following the pattern of existing tests:

- Spin up two local feeds A and B.
- A publishes `git-identity` claiming `a@example.com`.
- B publishes a commit (simulate by creating a `git-update` message, or — more realistically — create a repo, push a commit, and scrape via `git-server.js` test helpers).
- Load the resolver from B's perspective, with A followed. Assert that `resolveCommitAuthor({email: 'a@example.com'})` returns A's feed and tier `known`.
- Unfollow A. Assert tier drops to `self-claimed`.
- A publishes a revocation. Assert the resolver forgets the claim.

Also add a visual Playwright check: render a log page where several commits resolve to `known`, one to `extended`, one to `self-claimed`, one to `unverified`. Screenshot to `docs/img/git-identity-tiers.png`.

## Done when

- `type: git-identity` is documented in `docs/api.md`.
- `decent/src/modules/git/identity.js` exists, subscribes to `messagesByType` and `friends_hops`, and exports `resolveCommitAuthor` + `renderAuthor`.
- Every commit author slot in the git-forge UI goes through `renderAuthor`. No remaining hand-rolled `<span>author.name</span>` in the git modules.
- The profile page has a Git identities section that lists claimed emails and (for your own profile) lets you add and revoke them.
- A viewer who follows a feed that has claimed an email sees that feed's name and a green "known" icon next to matching commits. Unfollowing the feed downgrades the display to "self-claimed" without a reload (live subscription).
- The feature degrades gracefully: if the indexer is still warming up, the UI shows raw emails rather than empty cells.
- The `test/` suite includes the scenarios above and passes.
- A new session screenshot of the log view at `docs/img/git-identity-tiers.png` shows the four trust tiers side by side.
