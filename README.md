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

ssb was abandoned in 2024, this is an attempt to restore the original "classic" functionality. You can find the original project documentation at [scuttlebot.io](https://scuttlebot.io). This repo is maintained by Everett Bogue. please reach out if you have any questions to the contact information present at https://evbogue.com/

---

## Installation

### Prerequisites

- You must have [Node.js](https://nodejs.org/) (version 14 or higher) and `npm` installed.

### Install from NPM

From the repo root:

- `npm install`

This will download the server, all dependencies, and make the `sbot` command available within the project.

---

## Getting Started

Follow these steps to get your server running and connected to the network.

### 1. Start the Server

First, start your secure scuttlebutt server. This process will run in your terminal, and you should leave it running. It will generate your unique ssb identity and store data in `~/.ssb`.

From the repo root:
```bash
npm start
```

This is equivalent to `node bin start`. You should see output like:
```
ssb-server <version> <path> logging.level:<level>
my key ID: <@yourPublicKey>
```
**Leave this terminal window open!** It is your local sbot node. All other commands will be run in a **new, separate terminal window.**

### 2. Use the Command-Line Interface (CLI)

With the server running, you can open a **new terminal window** to run commands and interact with your sbot.

All commands follow the format: `node bin <command> [...args]`

**Example: Find Your Identity**

This command shows your public key (your ID on the network).
```bash
node bin whoami
```

**Example: See Connected Peers**

This command shows who your server is currently connected to. Initially, it will be empty.
```bash
node bin gossip.peers
```

### 3. Connect to the Network (Join a Pub)

To see messages from other people, you need to connect to a "pub." Pubs are ssb-servers that are run on public servers so that they are always available.

**Step A: Get an Invite Code**

First, you need an invite code from a pub. These are often shared on websites or in chat rooms for ssb communities. An invite code looks like a long string of text.

**Step B: Accept the Invite**

Once you have an invite code, use the `invite.accept` command to connect to the pub. This tells your sbot to follow the pub and begin downloading messages from it.

```bash
node bin invite.accept "PASTE_THE_INVITE_CODE_HERE"
```

After a few moments, your sbot will connect to the pub. You can verify this by running `node bin gossip.peers` again. You should now see the pub in your peer list.

### 4. Create Your Own Invites

You can also create your own invite codes to invite friends or connect your own devices.

```bash
# Create an invite that can be used 1 time
node bin invite.create 1
```

This will print an invite string you can pass to another person so they can connect to and follow your sbot.

---

## (Optional) Patchbay Lite Web Client

This repository also includes Patchbay, a lightweight web client to interact with your sbot from a browser.

### 1. Build the Client

This step only needs to be done once. From the repo root:

```bash
# 1. Navigate into the patchbay directory
cd patchbay

# 2. Install patchbay's dependencies
npm install --ignore-scripts

# 3. Build the client bundle
npm run lite
```

This produces `patchbay/build/index.html`, which is what the server will serve to browsers.

### 2. Run Patchbay

With the bundle built and your ssb-server running (`npm start`), open your browser to:

- **http://localhost:8989/**

The server will serve the Patchbay Lite UI and expose the necessary endpoints for the client. You can now browse and publish messages from your browser.

## Phoenix Feed View

If you want a static recreation of the classic Phoenix feed layout, the server now hosts that interface on its own port so it never collides with `ssb-ws` (default 8989) or the helper endpoints. Start your sbot (`npm start`) and visit:

- **http://127.0.0.1:9080/**

The view is served by `plugins/phoenix-ui.js` and is backed by the assets in `phoenix/`. You can override the host/port in `~/.ssb/config`:

```json
{
  "phoenix": {
    "host": "127.0.0.1",
    "port": 9080
  }
}
```

Picking another `port` keeps the Phoenix feed running alongside Patchbay or other services.

---
MIT
