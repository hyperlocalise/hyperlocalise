# Sanity Studio plugin inspector

## Status

Accepted

## Context

Hyperlocalise already ships Sanity **document automation** via WorkOS Pipes (import/push from the web app). Designers working in Sanity Studio need the same upload → translate → apply loop as the Figma plugin, without pasting connection tokens.

The published TranslationOS plugin (`sanity-plugin-tos`) is the Studio integration shape editors already know: a Structure **editor view** plus an optional **bulk** top-level tool.

## Decision

- Publish `sanity-plugin-hyperlocalise` from `apps/sanity-studio-plugin` (official `@sanity/plugin-kit` layout, dual CJS/ESM, Sanity v3+ peers, v2-incompatible shim).
- Public API: `hyperlocalisePlugin(S, config)` (editor view) and `hyperlocaliseTool(config)` (document-level bulk).
- Authenticate with PKCE OAuth only (`/api/oauth/sanity`, handoff + callback). Do not store an API key in the dataset.
- Bind each grant to the requesting Studio `Origin`; integration APIs reject tokens used from another origin.
- Org admins create **Studio plugin connections** under Integrations (`/sanity-connections`); OAuth consent picks one connection.
- Reuse server-side Sanity transforms (`extract-source`, `apply-translations`, `localize-document`) and the same JSON source paths as automation.
- Ship an in-repo Studio (`pnpm dev`, port 3333) that imports the plugin from `src/` for local testing.

## Consequences

- Separate DB tables (`sanity_plugin_*`) from automation sync state.
- npm publish via tag `sanity-studio-plugin-v*` and `.github/workflows/sanity-studio-plugin-publish.yml`.
- Local testing uses `pnpm dev` first; `link-watch` remains available for an external Studio.
