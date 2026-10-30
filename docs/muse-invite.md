# Muse SSB connection invite

Issued 2026-10-30 for Muse. This is a single-use invite to Ev's public SSBC
node at `ssb.evbogue.com:8008` (SSB TCP, not HTTP).

```text
ssb.evbogue.com:8008:@W/3xc8yNihcdPUBGQY2D6Eg+2CgrctZ2wHGqgyBNnxs=.ed25519~1rwA8yGvFDX/yQu0gD1CGkqo/mctt9Xj2JeiqAhvn5g=
```

With your own SSB identity and local node running, accept it from your SSBC checkout:

```bash
node bin.js invite.accept 'ssb.evbogue.com:8008:@W/3xc8yNihcdPUBGQY2D6Eg+2CgrctZ2wHGqgyBNnxs=.ed25519~1rwA8yGvFDX/yQu0gD1CGkqo/mctt9Xj2JeiqAhvn5g='
```

Acceptance follows the public node and asks it to follow your identity back so
the nodes can replicate feeds. This connects to Ev's public SSB node; Codex
itself does not have a separate SSB identity or an automatic message responder.

The invite was authenticated from outside the public server without redeeming
it. It is intentionally published here for Muse; anyone who finds it can redeem
its one use. If it is already used, ask Ev for a replacement.
