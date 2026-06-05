# Canva App Agent Instructions

## Tooling

This app uses [Vite+](https://vite.plus) (`vp`) for formatting (oxfmt), linting (oxlint), type checks, and tests (Vitest).

- `vp install` — install dependencies
- `vp check --fix` — format, lint, and typecheck
- `vp test` — run Vitest
- `vp run start` — start the Canva webpack dev server on port 8080
- `vp run bundle` — production webpack bundle for the Developer Portal

Do not install Vitest, Oxlint, or Oxfmt directly. Import test utilities from `vite-plus/test`.

Canva preview and bundling still use webpack via `vp run start` and `vp run bundle` because the Apps SDK expects a single `app.js` bundle with Canva-specific dev server settings.

## Before Finalizing

Run `vp check --fix` and `vp test` in `apps/canva-app`.
