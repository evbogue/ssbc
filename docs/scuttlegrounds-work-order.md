# Strange Scuttle Battlegrounds — implementation work order

Working short name: **Scuttlegrounds**. Status: **specified, not implemented**.
Requested by Ev at LAN JAM, Ferris and Co., November 2026. Source baseline inspected:
`24c6ba0`. This order authorizes a bounded game implementation, not a general game
platform. No game code or assets were produced while writing this order.

## Outcome and scope

Build a two-player colony-conquest game inside Decent. A feed message contains a
small live battlefield preview and a Play/Watch button. Playing opens an application
view that fills the viewport on desktop and phones. Players gather finite minerals,
construct factories, produce infantry, hovercraft and siege walkers, and destroy the
opponent's HQ. The shared alien landscape uses a 2D isometric aesthetic inspired by
SimCity 2000, with original artwork rather than copied assets.

Use simultaneous rounds and SSB commit/reveal. One player hosts: they create the map,
lock commitments and close reveals, and may force advancement when someone does not
submit. Every client independently validates the history and computes the same result.
The host coordinates phases; clients do not accept arbitrary host-authored world states.

Explicitly agreed: two players; full visibility; one shared map; workers mine directly
on depleting deposits (no mine building or hauling); workers also build adjacent
factories; HQs make workers; factories make the three combat units; production completes
in one round with different costs paid upfront; each unit gets one action per round;
movement uses eight directions, with diagonals costing one step; movement allowances
are worker/infantry/walker 1 and hovercraft 3; one unit per tile, with buildings occupying
separate tiles; opposing moves to the same destination fail; attacks target tiles after
movement; infantry/hovercraft range 1, walker range 2. Combat damage is simultaneous.

Defaults below settle the remaining details under Ev's instruction to assume reasonable
answers and write the work order. They are starting balance values, not playtested claims.
Changes after the first published match require a new rules version; do not silently
change the interpretation of existing matches.

Exclude fog of war, real-time networking, blockchain settlement, AI opponents, rankings,
trading, research, power, roads, repair, terrain deformation, interplanetary travel,
host migration, arbitrary map uploads and more than two participants. Observers may watch.

## Rules v1

### Map, starts and economy

- Fixed 12×12 square logical grid, rendered isometrically. Coordinates are integers
  `x,y` in `[0,11]`. Start with an authored, versioned `lanjam-1` map, not procedural terrain.
- HQ A at `(1,1)`, HQ B at `(10,10)`; workers at `(1,2)/(2,1)` and `(10,9)/(9,10)`.
  Faction A is The Expedition (humanoid); B is The Bloom (gelatinous). Host chooses
  either faction; guest gets the other. Stats are identical.
- Each player starts with 60 minerals, no factory and no combat units. A factory costs
  40, so players can build one immediately without borrowing anticipated mining income.
- Deposits at `(2,2)/(9,9)` and `(3,2)/(8,9)` each contain 120 minerals;
  `(5,4)/(6,7)` and `(4,6)/(7,5)` each contain 180. These pairs are symmetric under
  `(x,y) → (11-x,11-y)`. Other cells are open ground; alien plants/craters are decorative
  in v1 and must not look like impassable barriers. Test mirrored travel and expansion.
- A worker on a nonempty deposit mines up to 10 minerals per round if its action is
  mine or omitted. Income goes directly to its owner's stockpile. A move/build/hold
  order replaces mining, including failed moves. Moving onto a deposit starts mining
  next round. No carrying inventory and no worker consumption when building.
- Deposits visibly display remaining minerals; reaching zero leaves ordinary traversable
  ground. Factories cannot be placed on deposit cells, even after exhaustion, to keep
  build legality stable. Destroyed buildings leave open ground.
- Units cannot occupy building cells. Each building is one tile. Workers have no attack.
  Buildings do not automatically attack. No capture mechanic: destroy hostile buildings.

### Starting balance table

| Entity | Cost | HP | Move | Range | Damage to units | Damage to buildings |
|---|---:|---:|---:|---:|---:|---:|
| Worker | 20 | 2 | 1 | — | 0 | 0 |
| Infantry | 15 | 3 | 1 | 1 | 1 | 1 |
| Hovercraft | 35 | 5 | 3 | 1 | 2 | 1 |
| Siege walker | 70 | 10 | 1 | 2 | 3 | 5 |
| Factory | 40 | 10 | — | — | 0 | 0 |
| HQ | starting only | 20 | — | — | 0 | 0 |

Use Chebyshev distance (`max(abs(dx),abs(dy))`) for adjacency and attack range; no
line-of-sight or elevation modifiers. No random hits, armor, splash or critical damage.
Stats must be visible before purchases. One producer queues at most one unit per round.
Cap each player at 16 living units, counting workers, and 4 factories, including planned
construction. These bounds keep touch selection and messages manageable. Display caps.
No new HQ construction in v1. If all workers die, a surviving HQ can make replacements.

### Orders and payment

One unit order per entity: `hold`, `move`, `attack`, `mine` or `build`. Allow actions
only for eligible types: workers mine/build, combat units attack. `build` means factory
at the named adjacent tile; `move` contains an explicit path of 1–movement allowance
steps. Paths avoid implicit pathfinding differences. Render the path before submission.
Click/tap distant destinations uses local deterministic shortest-path preview; the
committed payload contains the resulting explicit path.

Producer orders are `train` with unit type and a nominated adjacent spawn cell. No
same-round movement, combat or production by newly completed entities. Omitted worker
orders mine if eligible; every other omitted unit/producer holds or idles.

Validate the complete batch against the opening board and starting mineral balance:
ownership, allowed verbs, duplicate entity orders, bounds, range, paths, caps and total
purchase cost. An invalid batch becomes the no-orders fallback in its entirety with a
visible reason; never partly execute a malformed or overspending batch. The UI blocks
such drafts before commitment, but the reducer must not trust the UI. Future income
cannot fund the current round. Reserve costs locally while drafting; debit in the
resolved state, not on unconfirmed submission. Commitments alone never spend minerals.

### Movement, construction and spawn conflicts

For a simple, deterministic v1, paths may traverse only cells that were empty of units
and buildings at round opening (apart from the mover's own starting cell). This forbids
swaps and following into a cell vacated that round. Eight-direction corner cutting is
allowed because v1 has no terrain obstacles. A moving unit either completes its entire
path or stays at its starting cell; no partial moves.

Compare each pair of otherwise valid submitted paths. If they share any cell, both
moves fail, including friendly moves. Checking the union of path cells intentionally
treats different arrival times as conflicting: simple rules over detailed traffic
simulation. Distinct paths that geometrically cross between cells are allowed.
All conflicts are computed before moving anything; never depend on iteration order.

Build and spawn targets must be empty at opening and adjacent to the worker/producer.
When a surviving move ends on a proposed placement tile, movement wins. Multiple
placements targeting one tile all fail. New building/unit placements cannot stack.
Failed placements refund their full cost at completion, but the worker/producer's
action is spent. A destroyed builder or producer fails its order with the same refund.
An intermediate path cell is not reserved after movement; only final occupancy matters
for placements. Refunds become available next round, never fund another current order.

### Resolution order

1. Validate reveals and full order batches against the opening state; substitute
   fallbacks. Reserve/debit validated construction and training costs.
2. Compute all movement conflicts, then apply successful moves simultaneously.
3. Eligible opening-state attackers fire at their ordered tiles, using their unchanged
   positions (attack and move are exclusive). Range is checked against that position.
   A tile now containing an enemy takes damage; empty tiles miss; friendly pieces
   receive no damage. No automatic retargeting, interception or return fire.
4. Sum all damage, then remove destroyed entities simultaneously. An attacker killed
   this round still fires. A worker killed before mining produces no income.
5. Resolve building/training placements and refunds using surviving builders/producers
   and resulting occupancy. Stable new entity IDs derive from round, player slot and
   ordering entity ID, never time or random numbers.
6. Surviving opening-state workers assigned mining extract minerals; new workers do not.
7. Check HQs: one destroyed means the other player wins; both destroyed means draw.
   Otherwise increment the round. At round 40, surviving HQs mean a draw. Also allow a
   signed resignation by either participant to end the match with an opponent win.

One shared pure reducer returns next state plus ordered presentation events. UI
animation may skip/speed up without affecting rules. Use bounded integers only, sorted
entity IDs, explicit array ordering and fixed versioned data. Do not consult clocks,
DOM, rendering frames or randomness inside the simulation.

## SSB protocol v1

### Trust and identities

SSB supplies author signatures, per-feed history and content-addressed message IDs;
the game supplies phase validation and deterministic state. Host control means they
can censor, stall or skip someone. Commit/reveal hides orders until commitment locking;
it cannot force disclosure or guarantee fair cutoffs. Do not advertise trustless finality.

Correction to earlier conversation: browsers do not necessarily share the host's identity.
`decent/src/keys.js:7` loads/generates browser-local keys, and
`decent/src/modules/core/crypto.js:65` signs locally then calls `sbot_add`. Separate
browser profiles/contexts can be distinct players using the same sbot database.
Use that existing `publish` plug, not `sbot_publish`, for game messages:
`decent/src/modules/core/sbot.js:175` calls the connected server's `publish`, which can
attribute both clients' orders to the server's identity. Serialize publication per local
identity and reconcile uncertain writes before retrying to avoid concurrent feed forks.
Do not create another signer or expose private keys to game payloads.

Prove the two-browser/one-sbot path on a burner before building graphics. A separate
pair of replicating burner sbots must later prove it also works through replication,
without assuming direct database access. Sharing one browser profile/origin shares
localStorage and is not a two-player identity test. No swapping keys in Ev's daily profile.

### Message family

Use one outer content type, `scuttlegrounds`, with `v: 1` and an `op` discriminator.
This enables one `messagesByType` subscription and keeps subsequent protocol events
out of generic reply threads. All events except creation reference `game` (creation
message ID). Every phase includes its predecessor's exact message ID, not just a round
number. Unknown versions must render an unsupported-version notice, not execute.

| op | Author | Required meaning |
|---|---|---|
| `create` | Host | Title (bounded), `rules: 'colony-1'`, `map: 'lanjam-1'`, host faction, invited guest feed ID |
| `join` | Invited guest | Accept the creation and complementary faction |
| `open` | Host | Round, previous accepted resolve (or join for round 1), opening state hash |
| `commit` | Either player | Opening ID and commitment digest; no orders/secret |
| `lock` | Host | Opening ID, exactly one commitment ID or null per player, forced flag |
| `reveal` | Either player | Lock ID, accepted commitment ID, exact orders encoding, random secret |
| `resolve` | Host | Lock ID, exactly one accepted reveal ID or null per player, forced flag, result state hash |
| `resign` | Either player | Most recent accepted phase ID; author concedes this match |

Creation names one invited player, avoiding open-seat races. Provide a friend/feed-ID
picker and faction picker, followed by an explicit Create match action. Guest must click
Join. Host opens round 1 after acceptance. Spectators cannot join, issue orders or advance.

Normal locking requires both valid commitments; normal resolution requires both valid
reveals. Force close is an explicit host-only action with a confirmation naming skipped
players. Missing commitments and missing reveals mean fallback orders. A referenced but
unavailable message means **waiting for data**, never fallback. A present mismatching
reveal or semantically invalid batch uses the documented fallback and shows why.

Only the first valid host lock per opening and first valid resolve per lock in the
host's signed feed sequence are accepted. Host phase messages form one linked chain;
buffer out-of-order events until referenced ancestry is available, including any gaps
in host sequence needed to select the first valid transition. Never use client arrival
order or untrusted timestamps. Later conflicting phase transitions are ignored and
shown as protocol violations. Host feed equivocation/forks are unsupported: mark the
match disputed and freeze; do not invent global consensus over forked feeds.

Permit one commitment per player/opening in the normal UI and disable editing after
submission. Lock explicitly selects the commitment; clients require it to have the
correct author and opening. Multiple commitments are suspicious, not a reason to choose
the latest by timestamp. A second reveal cannot replace the one selected by resolution.
Never auto-reveal before receiving and validating a lock that includes your commitment;
do not reveal into a conflicting lock or a round already resolved.

### Commitment bytes and recovery

Use `ssbKeys.hash(Buffer.from(text, 'utf8'))`; passing a bare string to the installed
helper defaults to binary encoding (`node_modules/ssb-keys/util.js:4`). Preserve the
helper's base64 + `.sha256` digest format consistently. Generate 32 random bytes using
browser `crypto.getRandomValues`, never `Math.random`, then base64 encode the secret.
LAN pages may run over HTTP: test this API in the actual browser deployment.

Define orders as fixed-position JSON arrays (no arbitrary objects), sorted by entity ID,
with unique entity IDs and integers only. Example tuples:

```text
[id,"hold"]
[workerId,"mine"]
[unitId,"move",[[x,y],[x,y]]]
[unitId,"attack",x,y]
[workerId,"build",x,y]
[producerId,"train","infantry"|"hovercraft"|"walker"|"worker",x,y]
```

`ordersText = JSON.stringify(sortedTuples)`. Hash UTF-8 bytes of:

```text
JSON.stringify(["scuttlegrounds-commit-v1", openingID, authorFeedID, ordersText, secretBase64])
```

Reveal carries `ordersText` verbatim; verifier hashes those exact bytes, then parses and
validates canonical ordering/schema. No floating point, unknown fields/verbs, duplicate
orders or surplus tuple elements. Hashing state uses a separately defined fixed-array
encoding of rules/map/round, player balances, deposits, sorted entities and outcome;
include golden vectors in tests. Exclude animation, camera, draft data and message
receipt times. Commitment equality is not a substitute for order legality checks.

Before publishing a commit, durably save ordersText, secret, opening and publication
intent in IndexedDB keyed by local feed ID/game/opening. Fail submission if persistence
fails. Then publish, store returned message ID, and update UI only after acknowledgement.
On callback uncertainty/reload, search the author's feed for the identical commitment
before publishing again. Preserve unrevealed secrets through navigation and reload.
Once lock is validated, auto-reveal only for that exact saved commitment; reveal has no
additional strategic choice, but must publish serially through the same identity queue.
Lost data must show a recoverability warning and permit host fallback; never fabricate
replacement orders. Cross-device secret recovery is outside v1. Optional encrypted
self-backup is deferred rather than putting plaintext secrets into public messages.

Public commitments reveal participation/timing, not commands; public reveals expose
orders permanently. A player can deliberately withhold after seeing others' reveals,
choosing between their committed action and fallback. Accept this limitation for the
friendly demo and mark forced rounds; do not claim commit/reveal eliminates cheating.

### Bounds, streaming and authority

Limit final signed messages to 8192 bytes, not merely content length. Keep content under
6000 UTF-8 bytes; at most 16 unit + 5 producer orders, path length at most 3. Enforce actual
serialized signed-message size before publication. Reject oversized inputs before deep
processing. Do not publish a whole map/state each round; map/rules are fixed local data,
and resolution carries references plus state hash. No blob dependency for core gameplay.

Load `messagesByType({type:'scuttlegrounds', old:true, live:true})`, with finite catch-up
where appropriate, filter by match and deduplicate by message ID. Query wrapper:
`decent/src/modules/core/sbot.js:126`. Fetch missing referenced messages with `sbot_get`
at `:144`, validate author/type/game/ancestry, and retry after replication. Get does not
magically replicate missing feeds: show connectivity/follow-scope diagnostics. Never
use `sbot_query` (unbuilt index) or `window.CACHE` as the authoritative game database.
Use shared bounded stores/subscriptions, not one infinite global stream per card.

Host buttons only emit legal phase transitions; automatically advance complete phases
while the host's game view is open, with an explicit force control for missing players.
If the host closes the browser, the match waits. Returning host reconstructs from SSB.
Clients recompute every resolution and refuse mismatching state hashes. Store/UI shows
pending dependencies, invalid transitions or disputed state explicitly. No optimistic
application of unconfirmed host results. Cached snapshots are disposable speedups, and
must be verified against the accepted history.

## Graphics and Decent integration

Use **PixiJS** for the isometric world and ordinary HTML for controls, text, dialogs and
accessible status. Pin a tested package version and update npm-shrinkwrap consistently.
Do a Browserify compatibility spike before choosing the version/integration: existing
build is Browserify (`decent/scripts/build-web.sh:22`), not a modern ESM app. If an ESM-only
distribution needs a separate prebuilt local asset, package it explicitly and load only
when opening the game; do not replace the client bundler or add a runtime CDN dependency.
Report actual bundle size growth. Engine/version compatibility has not been tested.

Suggested file boundaries (new paths, not claims about files that already exist):

| Proposed path | Responsibility |
|---|---|
| `decent/src/scuttlegrounds/rules.js` | Versioned map/stats, schemas, canonical encodings, pure round reducer |
| `decent/src/scuttlegrounds/protocol.js` | Message validation and linked phase state machine, usable in Node tests |
| `decent/src/scuttlegrounds/store.js` | SSB subscriptions, dependency loading, publication queue, draft/secret persistence |
| `decent/src/scuttlegrounds/renderer.js` | Pixi world, picking, camera, event animation and teardown |
| `decent/src/scuttlegrounds/assets/` | Original source sprites/atlas/manifest with attribution |
| `decent/src/modules/extras/scuttlegrounds.js` | depject adapter: menu, lobby, card renderer, game route and UI |
| `decent/src/base.css` | Shared panels, preview, full-viewport shell and mobile controls |
| `test/scuttlegrounds-rules.js` | Deterministic economy, movement, combat and production cases |
| `test/scuttlegrounds-protocol.js` | Author/phase/hash validation, reordering, recovery and tampering |

Frontend modules use `var`, named functions, CommonJS and existing formatting. Keep pure
rules and protocol free of Pixi/DOM imports so Node tests and any future referee can use
the same implementation. Do not add a server plugin just to run host turns.

Register the module in `decent/src/modules/extras/index.js`. Existing provider example:
`decent/src/modules/ui/pub.js:19`. Important: `message.js:412` tries
`message_content_mini` **before** `message_content`. Return a full game card for `create`
through the latter only; mini renderer must not shadow it. Render join/phase events as
compact status rows linking to the game, rather than big duplicate battlefields. Ordinary
posts/replies remain unaffected. Phase events must not set `root` and accidentally
redirect the generic thread UI away from the game. Rendering any message never publishes.

Offer a Scuttlegrounds lobby via `screen_view`, with create/join/watch and current games.
Use `#/scuttlegrounds/<raw-create-message-id>` and slice the route prefix; never
`decodeURIComponent` a raw SSB key. Existing routing is `core/app.js:76–99` and accepts
custom routes through `screen_view`. A game-specific fixed viewport shell can overlay
the app chrome; scope it to this route and restore normal layout/focus/scroll on exit.
Don't globally restyle the feed. Full viewport is required; browser Fullscreen API is
optional enhancement, never required for mobile/iOS play.

The preview uses a cheap static/demand-redrawn map, faction/round/readiness/outcome and
Play/Watch. No active Pixi context per feed card. Full view owns one renderer, resized
to its actual container using ResizeObserver; destroy it and release listeners/textures/
pointer capture on exit. App route replacement currently removes DOM without a disposal
hook (`core/app.js:94`): implement a narrowly scoped lifecycle mechanism for this view
and test it, rather than assuming detached canvases stop rendering. Pause animation in
hidden tabs; reduced-motion mode skips effects. Board state never depends on animation.

### Phone controls

- Portrait and landscape work at 375px CSS width; desktop mouse and keyboard also work.
- One-finger drag pans; pinch zooms; tap selects. Use movement thresholds to distinguish
  tap/drag, prevent accidental actions after gestures, and restrict `touch-action:none`
  to the battlefield. HTML panels still scroll normally.
- Select one unit, choose action in the bottom panel, then tap a highlighted legal tile.
  Show planned paths/target markers and editable order list before commitment. Buildings
  expose production and spawn-tile selection; workers expose build/mining/hold controls.
- Controls have at least 44×44 CSS pixel touch targets. Sprite hit testing expands small
  targets; if zoom makes adjacent targets ambiguous, zoom in or show a picker instead
  of silently choosing a neighbor. No action depends on hover, right-click or double-tap.
- Persistent compact HUD: minerals available/reserved, round/phase, opponent status,
  submit/committed/revealing state and exit. Host has force advance with named skips.
- Safe-area padding and dynamic viewport height; bottom panel must not obscure selected
  tiles. Fit map and explicit zoom buttons supplement gestures. Support keyboard focus,
  action buttons and textual selected-unit/status summaries; color is not sole ownership cue.
- Drafts and secrets survive close/reopen/reload. New accepted round invalidates old drafts
  with notice, not silent replay. Locked orders cannot be edited. Offline drafts are fine;
  offline submission is pending, not Ready. Connection loss cannot trigger a force action.

### Art direction and packaging

The Expedition: angular domes, metallic factory, suited worker/infantry, mechanical
hovercraft and four-legged siege walker. The Bloom: translucent nucleus, brood pool,
small gathering ooze, fighting ooze, floating tendril bladder and huge pseudopod walker.
These are visual variants of the same HQ/factory/worker/three combat-unit types.

Use original low-resolution isometric sprites, consistent tile footprint, camera angle,
lighting and feet anchors. Purple/teal ground, mineral crystals, subtle bioluminescence;
keep ownership rings and HP legible across faction colors and all skins. Start with
clear static sprites and small move/fire/death effects; no animation-sheet epic. Use
procedural placeholders for the first playable slice, then replace them with coherent
assets (use the imagegen skill if generating raster art). Do not bake labels into images.
Draw in deterministic screen-depth order; render health/selection over tall sprites.

Copy local assets into served build output via an explicit build step. The stylesheet
script currently copies an explicit file list (`decent/scripts/style.js:32–48`); a source
asset directory does not become public automatically. Static assets are served from
buildDir (`lib/ui-server.js:363–372`). Verify actual asset URLs on all skin ports after
build and cache-bust the app. No generated build edits by hand or unrelated skin changes.

## Delivery sequence

Each phase is a separate working commit, tested and pushed fast-forward to both remotes.
No phase is declared complete with uncommitted source changes. Keep default sbot running.

1. **Rules and identity spike.** Build the pure reducer and rules fixtures first. Prove
   two browser identities publish with distinct authors through the existing local-sign
   path on a burner. Prove a minimal Pixi scene embeds/resizes/destroys under the existing
   build. Record chosen version, integration and measured bundle impact. These spikes
   resolve the main technical uncertainties before artwork/UI investment.
2. **SSB match protocol.** Implement create/join/open/commit/lock/reveal/resolve/resign,
   author and phase checks, bounded state, secret persistence, serialized publication,
   force fallback and replay. Use a minimal debug view on burners. Verify automatic
   reveal/normal progression and explicit forced progression; no writes on rendering.
3. **Playable isometric view.** Lobby, feed preview, expanded route, board, picking,
   resource depletion, construction, training, movement/attack previews and HUD. Implement
   phone input in this phase, not a desktop-only pass followed by a mobile rewrite.
4. **Faction art and presentation.** Replace placeholders, add restrained animations,
   readiness/reveal/force notices, outcomes and spectator mode. Preserve clear unit roles.
5. **Demo validation and handoff.** Play a full two-player burner match, reconnect/reload,
   test real replication, force missing turns, verify phones/all skins, and document exact
   launch/join steps. Update canonical docs with shipped behavior and mark this order's
   implemented phases. Report anything not proven, especially real phone/LAN tests.

## Verification and acceptance

Tests must cover behavior rather than merely mirror implementation:

- Exact initial balance/map symmetry, exhausted deposits, no mining while moving/building,
  income after costs, overspending/duplicate orders, worker replacement and unit caps.
- Hostile/friendly shared path collisions, swaps/vacated-cell rejection, diagonal movement,
  range, empty-tile misses, no friendly fire, simultaneous mutual kills and HQ draw.
- Construction/spawn collision with movement and other placements, destroyed producers,
  blocked spawns/refunds, no same-round newborn actions, stable IDs and repeatable replay.
- Wrong authors, spectator orders, wrong match/round/version, altered reveal/salt,
  host commitment locked before any reveal (or explicit null/fallback when forcing),
  duplicate locks/resolves, forced skips, late messages,
  missing reference versus absent input, invalid batch fallback and bad state hash.
- Shuffled delivery, duplicate delivery, host feed gaps, uncertain publish retry and
  reload between commit/lock/reveal/resolve; golden UTF-8 commitment/state vectors shared
  between browser and Node. Stable results regardless of map/object insertion order.
- Message byte bounds, order limits, malformed arrays and text labels handled without
  executing remote markup/code. Resignation ends the game; rounds cannot continue after
  terminal outcome. Missing-reveal tactical escape remains documented, not hidden.

Run `npm test` cleanly before each implementation commit. After each frontend change,
run `npm run build:web`, verify `decent/build/index.html` size (baseline around 3.2 MB;
engine growth must be measured/explained) and grep for a new known string. Exercise
real browser views at desktop and 375px on decent2, ssbski and ssbpro; check canvas and
controls, not only page load. Capture before measuring and ensure innerWidth is nonzero.
Verify `.column.scroller` has no horizontal overflow where present, and the expanded
shell has no unintended document overflow. Cache-bust and verify the new UI actually loaded.

Use temporary data dirs, throwaway keys and isolated ports for write-path integration.
Never test game actions against Ev's live feed or overwrite their browser key storage.
Two browser contexts on a burner sbot prove distinct authors; two connected burner nodes
prove replication. Test at least two physical devices on the intended LAN: Wi-Fi client
isolation, advertised WebSocket reachability, CSP/asset delivery and HTTP browser APIs
can differ from localhost. Invite/follow/connect setup is explicit, not inferred from
an HTTP 200. No new public deployment or production restart is implied by this order.

Demo acceptance: two identities choose factions, create/join, open the full viewport
from a message card, move workers onto deposits, gather finite minerals, construct
factories, produce all three combat units, submit hidden commitments, reveal and resolve
movement/combat, force a missing commit and missing reveal, recover from reload, and
finish a match with independently matching state hashes. A spectator sees the same
resolved world but has no controls. Back navigation returns cleanly to the feed and
repeated open/close does not leak canvases, streams or listeners.

## Tradeoffs and unverified assumptions

- Small caps, fixed map, simple collisions, single-tile buildings and no terrain blocking
  prioritize a playable phone demo over simulation fidelity. Balance numbers need playtests.
- Host/browser coordination permits censorship and stalling. Commit/reveal protects
  locked order integrity, not availability, fair timeout enforcement or secret recovery.
- The renderer is replaceable; simulation/protocol must remain pure and replayable.
  Pixi package compatibility and sprite quality have not been verified in this repo.
- Separate browser identities and local signing were verified by reading source and
  prior repository notes, not by a new two-device test during authoring. Existing signing
  concurrency/retry behavior needs the explicit phase-1 spike before relying on it.
- Mobile pointer behavior, LAN transport, deployment headers, resource balance and match
  duration remain untested. Do not represent this work order as a completed game.
