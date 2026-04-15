# Repository Guidelines

## Project Structure & Module Organization
- Core entry: `index.js` exports the default `ssb-server` instance. CLI entry: `bin.js` (exposed as `ssb-server` / `sbot`).
- Library helpers live in `lib/` (CLI aliases, progress, validation). Vendored SSB packages live in `lib/vendor/`.
- Plugins live in `plugins/` — each is a secret-stack plugin with `{name, version, manifest, init}`.
- The Decent browser UI lives in `decent/`; build output goes to `decent/build/`.
- Tests live in `test/` and are plain Node scripts (mostly using `tape`). Use descriptive filenames like `caps.js`, `defaults.js`.
- System integration artifacts live in `systemd/`. Keep them minimal and distro-agnostic.
- Do not edit `node_modules/`; send fixes upstream and update dependencies instead.

## Build, Test, and Development Commands
- `npm install` – install dependencies (run once before development).
- `npm test` – run the full test suite (`node test/*.js`).
- `npm run test:pretty` – run tests with `tap-spec` output.
- `npm run coverage` – generate coverage via `nyc` (outputs `coverage/`).
- `npm start` – run the CLI locally (`node bin start`), equivalent to `ssb-server start` when installed globally.

## Coding Style & Naming Conventions
- Language: Node.js, CommonJS (`require`, `module.exports`), callback-style APIs and pull-streams.
- Indentation: 2 spaces, no hard tabs. Prefer single quotes and omit semicolons (match existing files).
- **Server-side** (`plugins/`, `lib/`, `test/`): use `const`/`let`, arrow functions, template literals.
- **Decent frontend** (`decent/modules_*/`): use `var`, named functions, and string concatenation — match
  the existing old-style CommonJS in those files.  Do not mix styles within a module.
- File and symbol names: camelCase for functions/variables, kebab-case for CLI commands, lowerCamelCase JSON/config keys.

## Testing Guidelines
- Tests use `tape`. Structure as `test('description', function (t) { ... })` and ensure all async work calls `t.end()` or ends via plan.
- To run a single test file: `node test/<file>.js`.
- Prefer deterministic tests using temporary directories under `/tmp/` and `process.env.ssb_appname = 'test'`, as existing tests do.
- When adding features or fixing bugs, include or update tests to cover the behavior; check `npm run coverage` if changes are large.

## Commit & Pull Request Guidelines
- Commit messages: short, imperative summaries (e.g. `Update caps defaults`, `Fix bin.js IPv6 handling`), with issue/PR references like `(#762)` when applicable.
- Pull requests should explain the motivation, outline key changes, list how to reproduce and verify, and state which tests were run.
- For behavioral or CLI changes, update `README.md` and add small usage examples where helpful.

## Decent Frontend Development

The `decent/` directory is a self-contained browser app with its own `package.json`.
For detail on its architecture, plugin system, and SSB message types see `CLAUDE.md`.

Key points for agents working on the frontend:

- **Build command:** `npm run build:web` from the repo root (or `cd decent && npm run lite`).
  Run after every change — do not batch changes before building.
- **Plugin system:** modules export `needs`, `gives`, and `create(api)`.  `'first'` = first
  implementation wins; `'map'` = all implementations run and outputs are merged.
- **`message_meta` and `message_action` are `'map'` plugs** — multiple modules contribute to
  each post's header and action row.  Changing one provider does not remove the others.
- **`window.CACHE`** is the in-memory message store.  Read from it; do not write to it.
- **SSB keys** start with `%` — never `decodeURIComponent` them.
- **`vote.reason`** is the correct spec field for emoji reactions; read `reason || expression`
  for backwards compat.

## AI-Assisted Development Notes

This repository is actively developed with Claude as a collaborator.  Notes for future
AI sessions:

- **Always pull before starting work.** The human developer pushes to the same feature branch
  between sessions.  New files or refactors may have landed since the last session.
- **Read files you haven't seen before a pull introduces them** — don't assume you know what
  they do from the name alone.  `render-embedded-post.js` is a real example of a new shared
  helper that changed how both `repost.js` and `post.js` work.
- **Work in phases with clear deliverables.** Commit and push after each discrete piece of
  work so the human can review and the branch stays in a shippable state.
- **When the human says "go" with no open questions, execute immediately.**  Don't re-ask for
  confirmation on things already agreed.
- **The human reviews upstream and may refactor between sessions.** If a pull brings in
  substantial changes, summarize what landed before continuing — don't silently assume the
  prior state.
- **Build and verify before committing.** Run `npm run build:web` and confirm there are no
  errors.  A clean build is the minimum bar before a commit.
- **Match the file's existing style.** Decent frontend modules use `var`; server modules use
  `const`/`let`.  Don't introduce style inconsistencies as a side-effect of feature work.

## Security & Configuration Tips
- Never commit secrets, private keys, or real-world `~/.ssb` data. Use throwaway keys and caps in tests and examples.
- Be conservative with network- and replication-related changes; prefer opt-in configuration flags and document defaults clearly.

