# Figma Plugin Agent Instructions

## Tooling

This plugin uses [Vite+](https://vite.plus) (`vp`) for formatting (oxfmt), linting (oxlint), type checks, and tests (Vitest).

- `vp install` — install dependencies
- `vp check --fix` — format, lint, and typecheck
- `vp test` — run Vitest
- `vp run dev` — watch and rebuild the Figma webpack bundle
- `vp run build` — production webpack bundle for import or publish

Do not install Vitest, Oxlint, or Oxfmt directly. Import test utilities from `vite-plus/test`.

Figma preview and bundling use webpack via `vp run dev` and `vp run build` because plugins ship as `code.js` plus an inlined `ui.html`.

## Before Finalizing

Run `vp check --fix` and `vp test` in `apps/figma-plugin`.
