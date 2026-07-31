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

## Syncing through a real SSB node: `light/relay.js`

A light node can **create, sign, store, and verify** a fully valid feed on its
own. What it *cannot* do alone is **gossip** — pushing those messages to other
peers. SSB replication is muxrpc over secret-handshake, and browsers can't open
raw TCP; to reach the network a browser must WebSocket into an always-on peer
(a pub/room) that relays for it.

`light/relay.js` provides exactly that: it connects a `Light` node to any SSB
node that speaks WebSocket, over the **real** protocol (secret-handshake +
muxrpc, via `ssb-client`), and replicates with classic history streams:

- **push** — upload our own signed messages with `add`
- **pull** — download other feeds with `createHistoryStream`, validating every
  message before keeping it

```js
const Light = require('./light/light')
const Relay = require('./light/relay')

const node  = new Light()
const relay = new Relay(node, {
  remote: 'ws://a-pub.example:8989~shs:<pubPublicKey>',   // a ws-capable SSB node
  // caps: { shs: '<network key>' }  // defaults to the main SSB network
})

relay.connect((err) => {
  if (err) throw err
  relay.sync([friendFeedId], (err) => {
    // our feed is now on the pub, and friendFeedId is pulled into relay.get(friendFeedId)
  })
  relay.follow(friendFeedId)   // stay live for new messages
})
```

**Follow-graph sync.** Instead of naming feeds by hand, replicate whoever your
own feed follows (from your `contact` messages):

```js
relay.following()                     // -> [ feedId, … ] derived from your contacts
relay.syncFollows({ hops: 2 }, cb)    // push yours up, pull your follows (and theirs)
```

**Durable.** Feeds the relay pulls are persisted to the same store as your
identity, so a new `Relay` over that store reloads them and resumes history where
it left off instead of re-downloading. Pass `{ persist: false }` to keep it all
in memory.

The transport is the same stack the Decent frontend already browserifies, so
the relay runs in the browser. It stays "light" because replication is plain
history streams — no flume, no EBT, no server-side plugins. A pub only needs to
expose a WebSocket address (`ws://…~shs:…`); pubs that are TCP-only aren't
reachable from a browser.

So: identity, signing, and publishing are 100% serverless; reaching other peers
needs one ws-capable relay node, which `relay.js` connects to.

### Try it: the standalone demo

`light/demo/` is a complete serverless client in one HTML page — generate an
identity, connect to a node, publish, and watch a feed update live. Build it with
`npm run build:demo` and open `light/demo/index.html`. See
[`light/demo/README.md`](demo/README.md).

### Browser bundling note

`ssb-client` pulls in `multiserver`'s `unix-socket` transport, which references
Node's `fs`/`os` and isn't used in a browser (we only dial `ws`). When bundling
for the browser, stub it out — e.g. browserify `-i multiserver/plugins/unix-socket`,
or an esbuild alias to an empty module — and force the pure-JS crypto path with
`process.env.CHLORIDE_JS = '1'` (alias `chloride` → `sodium-browserify-tweetnacl`).
The existing `npm run build:web` pipeline already handles the crypto side.

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

### Private (encrypted) messages

End-to-end encrypted DMs use `ssb-keys` box/unbox — pure JS, browser and Node.

```js
const pm = node.publishPrivate({ type: 'post', text: 'shh' }, [recipientId])
// on the wire pm.value.content is an opaque "…​.box" string; the message is
// still a normally-signed entry in your feed.

node.unbox(pm)          // -> { type:'post', text:'shh' }  for a recipient (you're always one)
node.unbox(someOther)   // -> null if it isn't addressed to you / isn't private
```

Up to 7 recipients (you are added automatically so you can read it back).

### Storage

Storage is pluggable. In a browser it defaults to `localStorage`; pass your own
`{ getItem, setItem, removeItem }` (e.g. an IndexedDB shim) via `opts.store`. In
Node with no `localStorage`, it falls back to an in-memory store.

```js
new Light({ store: myStore, keys: existingKeys, caps: { sign: hmacKey } })
```

`caps.sign` is the network's HMAC key; omit it for the main SSB network
(`null`), matching the default sbot configuration.

## Headless CLI

`light/cli.js` runs a light node from the terminal — no browser, no GUI, no
server. Identity and replicated feeds live under `$SSB_LIGHT_PATH`
(default `~/.ssb-light`), stored via `light/store-fs.js`.

```bash
node light/cli.js whoami
node light/cli.js publish "hello world"
node light/cli.js private @feedId "a secret"        # encrypted DM
node light/cli.js log                                 # your feed (private msgs decrypted for you)
node light/cli.js follow-add @feedId                  # record a follow in your feed
node light/cli.js following
node light/cli.js sync  ws://host:8989~shs:<pubkey>   # push + pull (follow graph if no @feeds given)
node light/cli.js watch ws://host:8989~shs:<pubkey>   # like sync, but stay live
```

Set `$SSB_LIGHT_REMOTE` for a default relay and `$SSB_LIGHT_CAPS` for a
non-default network.

## Tests

`test/light.js` (run by `npm test`) proves the full lifecycle: identity
generation, a signed and linked feed, independent id recomputation,
verification, tamper and broken-chain rejection, acceptance by a fresh
independent validator, and persistence across a storage reload.

`test/light.js` also covers private message encrypt/decrypt and recipient
isolation. `test/light-relay.js` (also run by `npm test`) stands up a **real**
secret-stack node with `ssb-ws` and proves two light nodes sync through it as a
relay: connecting over secret-handshake + muxrpc, pushing their own feeds up,
pulling each other's feeds down and validating them, replicating the follow
graph (including friends-of-friends at `hops: 2`), reloading persisted feeds from
storage, and having the node reject a forged message. `test/light-cli.js` drives
the CLI as a child process end to end, including a real ws sync to a pub.

Both modules have also been bundled and executed in real headless Chromium:
`light.js` to confirm keygen/signing/publishing/verification run in-page against
the browser's own `localStorage`, and `relay.js` to confirm a real browser
completes a secret-handshake to a real SSB node over WebSocket and replicates
its signed feed to it.
