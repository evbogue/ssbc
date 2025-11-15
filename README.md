# Secure-Scuttlebot Classic

sbotc is an open source **peer-to-peer log store** used as a database, identity provider, and messaging system.
It has:

 - Global replication
 - File-synchronization
 - End-to-end encryption

`ssb-server` behaves just like a [Kappa Architecture DB](http://milinda.pathirage.org/kappa-architecture.com/).
In the background, it syncs with known peers.
Peers do not have to be trusted, and can share logs and files on behalf of other peers, as each log is an unforgeable append-only message feed.
This means ssb-servers comprise a [global gossip-protocol mesh](https://en.wikipedia.org/wiki/Gossip_protocol) without any host dependencies.

### Classic rational

ssb was abandoned in 2024, this is an attempt to restore the original "classic" functionality. This repo is maintained by Everett Bogue. please reach out if you have any questions to the contact information present at https://evbogue.com/

## Patchbay Lite web client

This repo bundles the original browser version of Patchbay (circa 2016) as a lightweight web client.
It runs entirely in the browser and connects to your local ssb server over `ssb-ws`.

### What it is

- `patchbay/` is a copy of the original Patchbay codebase, lightly wired into this server
- `lib/frontend.js` serves the Patchbay Lite bundle at `/` when it has been built
- The code and UI are kept as close as possible to the 2016 era version

### Building the Patchbay Lite bundle

From the repo root:

- `cd patchbay`
- `npm install --ignore-scripts`
- `npm run lite`

This produces `patchbay/build/index.html`, which is what the server will serve to browsers.

### Running Patchbay Lite

With the bundle built:

- From the repo root, start the server with `npm start`
- Open `http://localhost:8989/` in a browser

The server will:

- Serve the Patchbay Lite UI at `/`
- Expose the RPC and blob endpoints needed by the client over `ssb-ws`

You can then:

- Browse and publish messages from the browser
- Edit your avatar and name using `about` messages

## Getting Started

### Install dependencies

From the repo root:

- `npm install`

### Start the sbot server

From the repo root:

- `npm start`

This is equivalent to:

- `node bin start`

By default this will:

- Use the appname from `process.env.ssb_appname` (or the default `ssb` app name) for its config and data directory.
- Create (or reuse) keys under that app directory.
- Write the RPC manifest to `~/.ssb/manifest.json` (or the appname-specific path).

You should see output like:

- `ssb-server <version> <path> logging.level:<level>`
- `my key ID: <@yourPublicKey>`

Leave that process running; it is your local sbot node.

### Connecting as a client

With the server running, you can run additional commands using the same CLI:

- `node bin <command> [...args]`

Examples:

- `node bin whoami`
- `node bin gossip.peers`
- `node bin status`

### Creating an invite

Once the server is running and reachable, you can create an invite code:

- `node bin invite.create 1`

This will print an invite string you can pass to another peer so they can join and follow your server.

---
MIT
