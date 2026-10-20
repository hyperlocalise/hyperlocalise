# Sanity Studio plugin inspector

## Status

Accepted

## Context

Hyperlocalise already ships Sanity **document automation** via WorkOS Pipes (import/push from the web app). Designers working in Sanity Studio need the same upload → translate → apply loop as the Figma plugin, without pasting connection tokens.

## Decision

- Publish `sanity-plugin-hyperlocalise` from `apps/sanity-studio-plugin` (official `@sanity/plugin-kit` layout).
- Authenticate with PKCE OAuth only (`/api/oauth/sanity`, handoff + callback).
- Bind each grant to the requesting Studio `Origin`; integration APIs reject tokens used from another origin.
- Org admins create **Studio plugin connections** under Integrations (`/sanity-connections`); OAuth consent picks one connection.
- Document inspector (not a top-level tool) drives upload/collect, jobs, and apply-plan write-back against the open document.
- Reuse server-side Sanity transforms (`extract-source`, `apply-translations`, `localize-document`) and the same JSON source paths as automation.

## Consequences

- Separate DB tables (`sanity_plugin_*`) from automation sync state.
- npm publish via tag `sanity-studio-plugin-v*` and `.github/workflows/sanity-studio-plugin-publish.yml`.
- Local testing uses `link-watch` + an external Studio (no in-repo dev studio).
