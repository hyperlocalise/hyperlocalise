# Hyperlocalise Web CI Build Design

## Context

`apps/hyperlocalise-web` is a standalone web app with its own lockfile and workspace metadata. The main CI workflow currently validates the action, Bazel targets, and Go quality gates, but it does not verify that the web app can build in CI.

The app-level guidance in `apps/hyperlocalise-web/AGENTS.md` says CI should prefer Vite+ and suggests `voidzero-dev/setup-vp` for GitHub Actions.

## Options Considered

### 1. Add the web build to `go-quality`

This would keep the number of jobs lower, but it mixes Node and Go concerns in one lane. Failures would be less isolated and the Go quality job would become slower and noisier.

### 2. Add a dedicated `hyperlocalise-web-build` job

This keeps the Node toolchain isolated, makes failures easy to attribute, and matches the fact that the web app is maintained as a separate workspace under `apps/hyperlocalise-web`.

## Decision

Add a dedicated `hyperlocalise-web-build` job to `.github/workflows/ci.yml`.

The job will:

- check out the repository
- set up Vite+ with cache enabled
- run from `apps/hyperlocalise-web`
- execute `vp build`

## Consequences

This adds a clear CI gate for the web app without changing the existing Go or Bazel lanes. It also follows the app-local tooling guidance instead of introducing a separate `pnpm` setup flow.
