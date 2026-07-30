# light — a serverless SSB node for the browser

`light/light.js` is a proof that the **essentials** of Secure Scuttlebutt run
entirely in the browser, with no sbot server and no network:

1. **make a keypair** — `new Light()` generates (or reloads) an ed25519 identity
2. **sign & publish a message** — `light.publish(content)` builds the next
   message in your feed, signs it, links it to the previous one, and computes
   its id
3. **verify** — `light.verify(msg)` and `light.verifyChain(msgs)` check
   signatures and the append-only chain

Everything is pure JavaScript. It reuses the two libraries the rest of `ssbc`
already depends on — [`ssb-keys`](https://github.com/ssbc/ssb-keys) (ed25519
via chloride's browser build → sodium-browserify/tweetnacl) and
[`ssb-validate`](https://github.com/ssbc/ssb-validate) (the canonical message
format and chain validation). Because it's the *same* format the server and the
wider network use, the messages a light node signs are real SSB messages any
peer will replicate and verify.

## Why this works without a server

A "published" SSB message is just a signed object in a specific canonical form:

```
{ previous, sequence, author, timestamp, hash: 'sha256', content, signature }
```

- The value is serialized with `JSON.stringify(value, null, 2)` (2-space
  indent, insertion field order — this exact encoding is load-bearing).
- `signature` is an ed25519 signature of that string.
- The message id is `'%' + sha256(canonicalJSON) + '.sha256'`.

None of that needs a server. The only stateful thing a light node must keep is
its own feed tip (`previous` id + `sequence`) so the chain stays linked — this
module tracks that in `ssb-validate` state and persists the log to storage.

## The one real caveat: creating ≠ gossiping

A light node can **create, sign, store, and verify** a fully valid feed on its
own. What it *cannot* do alone is **gossip** — pushing those messages to other
peers. SSB replication is muxrpc over secret-handshake, and browsers can't open
raw TCP; to reach the network a browser must WebSocket into an always-on peer
(a pub/room) that relays for it. So: identity, signing, and publishing are
100% serverless; broadcasting to others still needs at least one peer.

## Usage

```js
const Light = require('./light/light')

const node = new Light()            // generates or loads an identity
console.log(node.id)                // @…​.ed25519

const msg = node.publish({ type: 'post', text: 'hello' })
console.log(msg.key)                // %…​.sha256
console.log(node.verify(msg))       // true

node.verifyChain(node.log())        // true — the whole local feed validates
```

### Storage

Storage is pluggable. In a browser it defaults to `localStorage`; pass your own
`{ getItem, setItem, removeItem }` (e.g. an IndexedDB shim) via `opts.store`. In
Node with no `localStorage`, it falls back to an in-memory store.

```js
new Light({ store: myStore, keys: existingKeys, caps: { sign: hmacKey } })
```

`caps.sign` is the network's HMAC key; omit it for the main SSB network
(`null`), matching the default sbot configuration.

## Tests

`test/light.js` (run by `npm test`) proves the full lifecycle: identity
generation, a signed and linked feed, independent id recomputation,
verification, tamper and broken-chain rejection, acceptance by a fresh
independent validator, and persistence across a storage reload.

This module has also been bundled and executed in real headless Chromium to
confirm keygen, signing, publishing, and verification all run in-page against
the browser's own `localStorage`.
