# Repository Guidelines

## Project Structure & Module Organization
- Core entry: `index.js` exports the default `ssb-server` instance. CLI entry: `bin.js` (exposed as `ssb-server` / `sbot`).
- Library helpers live in `lib/` (CLI aliases, progress, validation). Prefer adding new shared logic here rather than in `bin.js`.
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
- Use `var` and classic function declarations in existing modules; introduce `const`/`let` only when touching newer code paths consistently.
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

## Security & Configuration Tips
- Never commit secrets, private keys, or real-world `~/.ssb` data. Use throwaway keys and caps in tests and examples.
- Be conservative with network- and replication-related changes; prefer opt-in configuration flags and document defaults clearly.

