# Standalone light-node demo

A complete serverless SSB client in a single HTML page. It generates an identity
in the browser, connects to a real SSB node over WebSocket (secret-handshake +
muxrpc), publishes posts through that node as a relay, and shows a feed updating
**live** as messages replicate.

## Build

```bash
npm run build:demo      # -> light/demo/index.html (self-contained, generated)
```

The bundle is generated and gitignored (like `decent/build/`). The build applies
the two browser fixes documented in `../README.md`: it aliases `chloride` to the
pure-JS `sodium-browserify-tweetnacl` backend and stubs `multiserver`'s
Node-only `unix-socket` transport (unused when dialing `ws`).

## Use

Open `light/demo/index.html` in a browser and paste the address of any
ws-capable SSB node into **Relay node**:

```
ws://your-node-host:8989~shs:<the node's public key without the @ and .ed25519>
```

Your `ssbc` node prints its id on startup (`my key ID: @…`), and Decent/`ssb-ws`
already listen on `ws`. You can also pre-fill the address with a query string, so
the page connects on load:

```
index.html?remote=ws://127.0.0.1:8989~shs:<pubkey>
```

Add `&caps=<shs key>` to join a non-default network. Once connected:

- **Publish** signs a post with your browser-held key and pushes it up to the
  relay; it appears in the feed as it replicates back.
- **Follow a feed** (`@…​.ed25519`) live-streams that feed in through the relay.

Everything — identity, signing, verification — happens in the page. The node is
only a relay to the rest of the network.

## Notes

- A browser can only reach nodes that expose a `ws://…~shs:…` address; TCP-only
  pubs aren't reachable from a browser.
- Whether a given public node accepts an unfollowed stranger's `add`/history
  requests depends on that node's policy. A node you run yourself always will.
