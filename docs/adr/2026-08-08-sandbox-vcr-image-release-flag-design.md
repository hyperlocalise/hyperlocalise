# Sandbox VCR image release flag

## Problem

Phase 1 publishes `hyperlocalise-sandbox` to Vercel Container Registry. App
sandbox creates still use managed `node26` plus create-time installs. We need a
safe, reversible cutover to `Sandbox.create({ image })`.

## Decision

Add Flags SDK release flag `release-sandbox-vcr-image` and optional env
`VERCEL_SANDBOX_IMAGE`. When the flag is on and the image ref is set,
`createConfiguredVercelSandbox` passes `image` instead of `runtime: "node26"`.

This is a release flag, not a WorkOS workspace flag: sandbox create runs in
workflows and other paths without org/user context.

## Behavior

| Flag (`decide` / override) | `VERCEL_SANDBOX_IMAGE` | Create options |
|----------------------------|------------------------|----------------|
| off | any | `runtime: "node26"` (today) |
| on | unset / empty | `runtime: "node26"` (fail closed) |
| on | set | `image: <ref>` |

Caller-supplied `runtime`, `image`, or snapshot `source` still wins.

`decide()` reads env `RELEASE_SANDBOX_VCR_IMAGE=true` so workflow paths (no
request) can enable the cutover. Flags Explorer overrides still win when a
request context exists.

Bootstrap (`installRequiredSandboxToolsCommand`) stays. The image already has
`rg` / `hl` / Chromium deps, so those steps are mostly no-ops; keeping them
covers warm reuse and image drift.

## Surfaces

- Key: `release-sandbox-vcr-image` in `release-flag-keys.ts` / `release-flags.ts`
- Image: optional `VERCEL_SANDBOX_IMAGE` in `env.ts`
- Create: `createConfiguredVercelSandbox` in `vercel-sandbox-config.ts`
- Discovery: `.well-known/vercel/flags` for Flags Explorer

## Out of scope

- Removing bootstrap or screenshot Playwright install paths
- Per-organization WorkOS gating
- Using the image for Vercel Functions
