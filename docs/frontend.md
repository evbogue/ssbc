# Frontend

This document describes the current frontend in this repository, which ships in two skins:
**Decent** and **ssbski**.

## What Decent and ssbski are

Decent is the browser UI for this repo’s local SSB node. It is served by
`plugins/decent-ui.js` and, by default, is available at:

- `http://127.0.0.1:8888/`

ssbski is a second skin of the same UI — a Bluesky-style layout with Discover/Following feed
tabs, a trending sidebar, and a sticky centre-column header. It is served by
`plugins/ssbski-ui.js` (both plugins delegate to `lib/ui-server.js`) and, by default, is
available at:

- `http://127.0.0.1:8990/`

The two are **the same JavaScript bundle** talking to **the same local SSB node** — only the
stylesheet differs (`style.css` for Decent, `ssbski-style.css` for ssbski). UI modules that
need to vary behavior between skins detect ssbski by checking for the `ssbski-style.css`
stylesheet link (see `decent/src/modules/core/app.js`). The two public instances on the
network are [decent.evbogue.com](https://decent.evbogue.com/) and
[ssbski.evbogue.com](https://ssbski.evbogue.com/).

Neither is a separate web app backed by a generic REST API. Both are browser clients built specifically around the local SSB server behavior exposed by this repo.

## Build pipeline

The frontend source lives in:
- `decent/`

The main build command is:

```bash
npm run build:web
```

That produces the built frontend under:
- `decent/build/`

This directory is generated and is **not** committed to the repository (it is listed
in `decent/.gitignore`), so a fresh clone must run `npm run build:web` once before the
web UI will serve.

The current build flow browserifies the frontend entrypoint and generates the served
`index.html` and stylesheet assets. Because Decent and ssbski share one JS bundle and differ
only in CSS, this single command builds **both** skins — it emits `style.css` for Decent and
`ssbski-style.css` for ssbski. Always rebuild both after any frontend or stylesheet change;
never leave one skin stale.

## Runtime model

At runtime:
1. the HTTP server serves the Decent bundle
2. the page is loaded in the browser
3. the server injects websocket remote information into the HTML when needed
4. the frontend connects back to the local sbot-compatible surface
5. frontend modules render feed, profile, thread, git, and other UI behavior

## Source layout

The important frontend areas are:

- `decent/src/main.js`
  - frontend entrypoint
- `decent/src/wire.js`
  - plugin wiring/combinator behavior
- `decent/src/modules/core/`
  - low-level core client behavior
- `decent/src/modules/ui/`
  - main user-facing UI modules
- `decent/src/modules/git/`
  - git-related UI modules
- `decent/src/modules/extras/`
  - optional/extra modules
- `decent/src/style.css`
  - Decent stylesheet source
- `decent/src/ssbski-style.css`
  - ssbski stylesheet source

## Plugin/module architecture

Decent uses a small plugin-style architecture.

Modules declare:
- `needs`
- `gives`
- `create(api)`

These are wired together at startup.

This pattern is important to the frontend architecture and should be preserved in explanations of how Decent works.

## HTTP integration

The frontend is tightly integrated with the HTTP server in `plugins/decent-ui.js` (and, for
the ssbski skin, `plugins/ssbski-ui.js`; both share `lib/ui-server.js`).

That plugin serves:
- the HTML and assets for its skin
- stylesheet fallback handling
- blob upload and download routes
- current documentation at `/docs` and the historical archive at `/docs/archive`
- git HTTP routes through the git server plugin

## Websocket integration

The server injects a `window.PATCHBAY_REMOTE` value into the served HTML when appropriate.

This gives the frontend the remote connection information it needs for websocket-based access back to the local node.

That means frontend behavior is partly determined at serve time by the runtime environment and current request.

## Blob handling

The frontend relies on HTTP blob routes exposed by the same server:
- `POST /blobs/add`
- `GET /blobs/get/:hash`

This is part of how images and other blob-backed content flow through the UI.

## Git integration

The same HTTP server also supports git routes.

This matters because Decent is not only a social/feed UI. In this repo, it also participates in a broader local experience that includes git-over-SSB behavior.

## Practical development loop

Typical frontend work looks like:

```bash
npm install
npm run build:web
npm start
```

Then open the UI in the browser and verify behavior there.

## Documentation rule for the frontend

Frontend docs should describe:
- the current build flow
- the current module structure
- the current runtime connection model
- the current HTTP/blob/ws integration

They should not require the reader to infer all of this from older Patchbay or historical scuttlebot assumptions.
