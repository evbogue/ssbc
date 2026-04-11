# Decent

Decent is a browser UI for Secure Scuttlebutt, served by `plugins/decent-ui.js` on port `8888`.
It uses [depject](https://github.com/dominictarr/depject) for module wiring and connects to the running sbot via WebSocket.

## Building

From the repo root:

```bash
npm --prefix decent install --ignore-scripts
npm run build:web
# or equivalently:
npm --prefix decent run lite
```

Output files:

- `decent/build/index.html`
- `decent/build/bundle.js`
- `decent/build/style.css`

## Running

Start the sbot server (`npm start` from repo root), then open:

```
http://127.0.0.1:8888/
```

The server injects the WebSocket remote address into the page automatically.

## Configuration

Override host/port in `~/.ssb/config`:

```json
{
  "decent": {
    "host": "127.0.0.1",
    "port": 8888
  }
}
```

If the Decent UI is behind a reverse proxy, set `wsRemote` to the public WebSocket address:

```json
{
  "decent": {
    "wsRemote": "wss://your.domain:443"
  }
}
```

## Module structure

Modules live in `decent/modules_basic/` and `decent/modules_core/` and are wired together via depject.

Key modules:

| Module | Purpose |
|---|---|
| `modules_core/sbot.js` | WebSocket connection to sbot; exposes pull-stream sources |
| `modules_core/keys.js` | Load/generate identity keys (localStorage in browser, disk in Node) |
| `modules_core/crypto.js` | Sign messages client-side via `ssb-validate` |
| `modules_basic/names.js` | Resolve feed IDs to display names from `about` messages |
| `modules_basic/public.js` | Public timeline from followed feeds |
| `modules_basic/profile.js` | Profile view |
| `modules_basic/compose.js` | Compose and publish posts |

## License

MIT
