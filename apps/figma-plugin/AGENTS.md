# Figma Plugin Agent Instructions

## Tooling

This plugin uses [Vite+](https://vite.plus) (`vp`) for formatting (oxfmt), linting (oxlint), type checks, tests (Vitest), and production builds.

- `vp install` — install dependencies
- `vp check --fix` — format, lint, and typecheck
- `vp test` — run Vitest
- `vp run dev` — watch and rebuild `dist/ui.html` and `dist/code.js`
- `vp run build` — production Vite bundle for import or publish

Do not install Vitest, Oxlint, or Oxfmt directly. Import test utilities from `vite-plus/test`.

The plugin UI talks to `hyperlocalise-web` over HTTPS. Set
`HYPERLOCALISE_APP_URL` when developing against a local app.

Figma bundling uses two Vite builds:

- `vite.config.ts` — React UI inlined into `dist/ui.html` via `vite-plugin-singlefile`
- `vite.code.config.ts` — plugin sandbox logic bundled to `dist/code.js`

## Before Finalizing

Run `vp check --fix` and `vp test` in `apps/figma-plugin`.
