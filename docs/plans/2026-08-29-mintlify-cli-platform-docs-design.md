# Mintlify CLI and Platform docs

Date: 2026-08-29

## Decision

The Mintlify site documents two products under one language switcher: Platform (default) and CLI. Legal pages are removed; privacy stays on the marketing site.

## Navigation

Root pattern stays `languages`. Each language nests `products`:

1. Platform (first) — Cloud workspace. English includes scaffold guides. `zh` and `vi` keep Platform to the locale homepage until those guides are translated.
2. CLI — existing command, config, provider, and TMS docs, moved under `cli/`.

Contributing appears in both products. `docs/adr/` and `docs/plans/` stay out of Mintlify.

## Files

```
docs/index.mdx              Platform home (/)
docs/platform/              Cloud guides
docs/cli/                   former CLI tree
docs/contributing/          shared
docs/{zh-CN,vi-VN}/         same shape
```

Old CLI URLs redirect with `/section/:slug*` → `/cli/section/:slug*` for `getting-started`, `commands`, `configuration`, `workflows`, `providers`, `storage`, `troubleshooting`, and `reference`.

## Translation

`i18n.yml` maps those trees explicitly instead of `docs/**/*.mdx`:

- `docs/index.mdx`
- `docs/platform/**/*.mdx`
- `docs/cli/**/*.mdx`
- `docs/contributing/**/*.mdx`

The `default` group still targets `zh-CN` and `vi-VN`.
