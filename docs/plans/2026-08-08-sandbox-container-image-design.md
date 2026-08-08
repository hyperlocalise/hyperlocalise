# Sandbox container image (Vercel Container Registry)

## Problem

Every Vercel Sandbox created through `createConfiguredVercelSandbox` installs
ripgrep, the hyperlocalise CLI, and Chromium system libraries at create time.
Screenshot capture then installs Playwright into a writable directory. That
repeats network and package work on cold sandboxes.

## Approach

Publish a custom OCI image to [Vercel Container Registry](https://vercel.com/docs/container-registry)
and boot sandboxes from it with `Sandbox.create({ image })`.

1. **Image source**: `apps/sandbox-image/Dockerfile` extends the public managed
   image `vercel/sandbox/node:26` and bakes ripgrep, `hl`, Playwright Chromium,
   and OS libs.
2. **Registry**: Push as `hyperlocalise-sandbox:latest` (or a digest pin) via
   `vercel vcr build docker . hyperlocalise-sandbox:latest --push`.
3. **App wiring**: Optional `VERCEL_SANDBOX_IMAGE`. When unset, behavior stays
   `runtime: "node26"` plus bootstrap. When set, create uses `image` instead.
4. **Browser path**: Playwright runtime moved to
   `/vercel/hyperlocalise-browser-runtime` so image layers survive (unlike a
   possible tmpfs on `/tmp`).

Bootstrap remains after create as a cheap idempotent check (`command -v rg/hl`,
libnspr presence) so unmanaged runtimes keep working.

## Out of scope

- CI job to rebuild/push on pin bumps (follow-up)
- Removing bootstrap entirely once the image is mandatory in production
- Using the image for Vercel Functions
