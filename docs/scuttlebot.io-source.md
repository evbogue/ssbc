# scuttlebot.io docs source

The browsable docs served at `/docs` come from generated files in:
- `docs/scuttlebot.io/`

Their source of truth lives in:
- `vendor/scuttlebot.io/`

Do not hand-edit generated HTML in `docs/scuttlebot.io/` unless you are doing emergency surgery.
Prefer editing the vendored source and then resyncing.

## Sync workflow

From the repo root:

```bash
npm run sync:scuttlebot-docs
```

That command:
- installs the vendored docs generator dependencies
- rebuilds `vendor/scuttlebot.io/build`
- copies the generated output into `docs/scuttlebot.io/`
