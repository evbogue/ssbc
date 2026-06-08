# Blocking model: transitive vs. first-person (a design decision)

This is a decision record. It analyzes one question:

> **Should ssbc keep SSB's transitive (contagious) blocking, or revert to the
> original first-person blocking?**

The mechanics are grounded in current code. The recommendation is the maintainer's
to accept or reject; the analysis exists so the reasoning is explicit and
contestable.

> Status: design analysis / decision record. It tracks current behavior and cites
> code, but it is editorial and is deliberately not part of the served `/docs`
> allowlist (see [docs-maintenance.md](docs-maintenance.md)).

## The two models

A block is the same message in both models — a public, append-only `contact`
message on your own feed:

```json
{ "type": "contact", "contact": "@them=.ed25519", "blocking": true }
```

What differs is **whose behavior the block governs**.

### First-person blocking (original SSB)

The archived block plugin describes its entire job in one sentence:

> "Disallow connections with people flagged by the **local user**, and avoid
> sending a feed to the users **they've** flagged." (`isBlocked` defaults
> `source` to the **local user**.) — `/docs/archive`

Every clause is scoped to *you*: don't connect to people **I** blocked, don't
serve **my** feed to people **I** blocked. A block was a fact about the blocker's
own node and nothing else. Follow and block were even kept in **separate graphs**
(`hops(start, 'follow' | 'flag')`). A block had **no leverage over anyone else's
view** — if you blocked X, X disappeared from *your* node, and your followers were
entirely unaffected unless they independently blocked X too.

### Transitive blocking (the newer friends plugin, what ssbc runs today)

ssbc's `plugins/friends` adopts the later layered-graph / dynamic-dijkstra model.
Follow and block are **fused into one weighted graph** — follow `+1`, block `-1`
— and reachability is a Dijkstra traversal from your id
([contacts.js:13](../plugins/friends/contacts.js)). A block is no longer a fact
about the blocker's node; it is a **negative edge that propagates**. A block
published by *anyone within your hop range* pushes the target to a negative hop
value, which drops them from *your* replication
([index.js:58-64](../plugins/friends/index.js)).

The defining consequence: **one person's block automatically reaches into the
replication sets of everyone downstream of them in the follow graph.** An
influential, widely-followed account now wields a block that prunes a target from
the periphery's networks without any of those peripheral users deciding anything.

| | First-person (original) | Transitive (current) |
|---|---|---|
| Message format | `contact`/`blocking`, public | **same** |
| Whose behavior it governs | only the blocker's node | the blocker **and everyone downstream** in hops |
| Follow vs. block | separate graphs | one unified weighted graph |
| Transitive? | **No** | **Yes** — propagates as a `-1` edge |
| Power of a popular account's block | none beyond their own node | prunes the target from many followers' replication |

Note the message and its *publicness* are identical in both. The change in 2017–2019
was not visibility — it was **mechanical reach**.

## Why this matters

The transitive model was introduced for a real reason: **leaderless defense
against mass spam and sybil attacks.** In a network with no admin to ban bad
actors, contagious blocks let a community immunize itself — once trusted nodes
block a spammer, the spammer falls out of everyone's replication automatically. As
anti-spam infrastructure for a large, open network, that is a genuinely clever
design.

But the same mechanism that immunizes against spammers also hands **exclusionary
leverage over interpersonal conflict** to whoever is most central in the graph.
The costs are paid regardless of whether spam is actually the problem:

- **Concentrated power.** A widely-followed account's block propagates to all
  downstream followers by default. Block becomes a network weapon, not a personal
  boundary.
- **Opaque exclusion without due process.** People fall out of the periphery's
  view with no notice, no explanation, and no appeal — there is no admin to
  petition, because there is no admin.
- **Conflation of two different acts.** "I don't want to see you" and "my
  followers shouldn't see you either" are very different moral claims. Transitive
  blocking fuses them into one gesture.
- **Chilling effect.** When a central account's block can erase your reach,
  dissent and out-group membership carry a structural penalty. This rewards
  conformity to whoever holds graph centrality.

This last point is not hypothetical. The transitive change is **the reason the
maintainer left SSB in 2019**, and it coincided with a broader period of
call-out / "block party" dynamics that the design actively amplified. That lived
outcome is evidence the cost is real, not theoretical — losing community members
is the most concrete signal a moderation design can produce.

## The deciding factor: ssbc's threat model

Whether transitive blocking is worth its cost depends entirely on **whether mass
spam is the actual threat.** Transitive blocking's only real benefit is automated
herd defense, and that benefit materializes only when the network is (a) large,
(b) open to anonymous joiners, and (c) under genuine spam pressure.

ssbc is none of those. It is a small-world, invite-gated
([the invite plugin](../plugins/invite/index.js)), single-maintainer-centric
deployment ([decent.evbogue.com](https://decent.evbogue.com/),
[ssbski.evbogue.com](https://ssbski.evbogue.com/)). Its realistic threat is not a
spam flood; it is interpersonal exclusion dynamics among a handful of central
nodes — which is exactly the failure mode transitive blocking *worsens*. So for
ssbc:

- The **benefit** of transitive blocking is largely unrealized (no mass-spam threat).
- The **cost** is fully paid (central-node leverage is worse, not better, in a small graph where few accounts hold most of the follows).

That asymmetry is the crux of the decision.

## Options

1. **Revert to first-person blocking (recommended).** A block governs only the
   blocker's own node: you don't replicate or connect to people *you* blocked, and
   third-party blocks do not subtract from your reachability. Restores the
   original SSB semantics the maintainer favored.
2. **Keep transitive blocking.** Justified only if ssbc expects to become a large,
   open network under spam pressure — currently it does not.
3. **First-person by default + opt-in shared block-lists.** A block is
   first-person, but you may *voluntarily subscribe* to another feed's (or a
   curated list's) blocks. This is the composable / ATProto model: it recovers
   herd anti-spam defense *as a choice* rather than imposing it, and it never
   gives any account involuntary leverage over your view. This is the principled
   long-term shape.

## Recommendation

**Revert to first-person blocking as the default, and keep option 3 (opt-in
shared block-lists) open as the path to recover herd defense if spam ever becomes
a genuine threat.**

Rationale:

- It matches ssbc's actual threat model — interpersonal, small-world — where
  transitive blocking's spam-defense benefit is unrealized but its
  central-node-leverage cost is fully paid and even amplified.
- It removes the specific pathology that drove the maintainer (and others) off
  SSB, aligning the project with its founding motivation.
- The lost capability (automatic anti-spam) is recoverable later, *as opt-in*,
  which is strictly better on the sovereignty axis than mandatory contagion.
- First-person blocking is more legible: a block does exactly what the person
  pressing the button intends, and nothing more.

The honest counter-argument: if ssbc ever opens to large-scale, anonymous
membership, first-person blocking shifts the full anti-spam burden onto each user,
and the lack of automatic herd immunity could become painful. Option 3 is the
hedge against that future. The recommendation is therefore not "transitive
blocking is bad" — it is "transitive-by-default is the wrong default for *this*
network."

## Implementation notes

Reverting is mechanically contained, which lowers the risk of the change:

- The transitive effect comes entirely from **third-party block edges being
  treated as negative weights in the shared reachability graph**. In
  [contacts.js:13](../plugins/friends/contacts.js), `contactValue` returns `-1`
  for a block by *any* author, and those edges feed the dijkstra traversal that
  drives replication.
- First-person replication = build reachability from the **follow graph only**
  (do not let other feeds' block edges subtract from hops), then apply **your
  own** blocks as a final filter on what you `replicate.request`
  ([index.js:58-66](../plugins/friends/index.js)).
- The **connection auth hook is already first-person** — it checks only
  `source: sbot.id` ([index.js:45-51](../plugins/friends/index.js)), so it needs
  no change.
- The EBT block-forwarding loop currently forwards *every* feed's blocks to
  `ebt.block` ([index.js:73-96](../plugins/friends/index.js)); under a
  first-person model you would forward only your own (serving-correctness is a
  separate axis worth a follow-up note).
- `friends.isBlocking` and the legacy edge-value shim
  ([legacy.js](../plugins/friends/legacy.js)) can stay as-is; they query the graph
  rather than drive replication.

A full implementation should land with a test that asserts a feed blocked *only by
a third party* (not by you, and reachable via follows) **remains replicated** —
the inverse of today's behavior.

## Appendix: how other networks handle this

For context, the same first-person-vs-collective axis appears across the
ecosystem, distinguished by *where authority lives*:

| Model | Block visibility | One person's block affects others? | Authority |
|---|---|---|---|
| Centralized (X, Meta) | Private | No (isolated) | Central / corporate |
| Fediverse (Mastodon) | Personal private; defederation public | Defederation: yes | Instance admin |
| Bluesky / ATProto | Public | Yes, via *subscribed* lists | Composable / opt-in |
| First-person SSB | Public | **No** | None |
| Transitive SSB (today) | Public | **Yes, automatically** | None (emergent) |

Two observations relevant to the decision:

- **Bluesky is the cautionary case.** It kept SSB's public-block transparency but
  reintroduced a global feed and large-scale, low-trust membership — and the same
  public block records that were benign on Scuttlebutt became material for
  pile-ons. The transparency was never the problem; the amplification surface was.
  This is also why classic SSB's *public* blocks were not weaponized: no global
  surface, replication-scoped visibility, no algorithmic re-injection, and a small
  high-trust community where public blocks act as accountability rather than
  ammunition.
- **Option 3 above is exactly Bluesky's composable model** minus the global feed —
  opt-in shared block-lists without the amplification surface. That is arguably
  the best of both: collective defense available as a choice, sovereignty
  preserved as the default.

## References

- Block ingestion and edge weights: [plugins/friends/contacts.js](../plugins/friends/contacts.js)
- Enforcement (auth, replication, EBT): [plugins/friends/index.js](../plugins/friends/index.js)
- Legacy edge-value shim: [plugins/friends/legacy.js](../plugins/friends/legacy.js)
- Graph traversal semantics: [node_modules/layered-graph](../node_modules/layered-graph/index.js),
  [node_modules/dynamic-dijkstra/simple.js](../node_modules/dynamic-dijkstra/simple.js)
- Archived classic behavior: `/docs/archive` (block and friends plugins)
</content>
