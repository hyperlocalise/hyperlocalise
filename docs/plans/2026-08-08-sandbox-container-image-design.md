# Sandbox container image (Vercel Container Registry)

## Problem

Every Vercel Sandbox created through `createConfiguredVercelSandbox` installs
ripgrep, the hyperlocalise CLI, and Chromium system libraries at create time.
Screenshot capture then installs Playwright into a writable directory. That
repeats network and package work on cold sandboxes.

## Approach (phase 1)

Publish a custom OCI image to [Vercel Container Registry](https://vercel.com/docs/container-registry)
without changing sandbox create paths yet.

1. **Image source**: `apps/sandbox-image/Dockerfile` builds from public
   `ubuntu:26.04` (Vercel sandbox foundation). It does not `FROM` VCR managed
   images because unauthenticated pulls return 401 and break fork/PR CI. The
   image installs Node 24, ripgrep, Volta, `hl`, and Playwright Chromium at
   paths the current bootstrap/screenshot code already expects.
2. **CI**: `.github/workflows/sandbox-image.yml` builds on PRs and pushes
   `:sha` + `:latest` from `main` (and `workflow_dispatch`) to
   `vcr.vercel.com/<team>/<project>/hyperlocalise-sandbox`.

## Follow-up (phase 2)

Point `Sandbox.create` at the VCR image (for example via `VERCEL_SANDBOX_IMAGE`)
and trim create-time installs once the image is Ready in production.

## Out of scope for phase 1

- Changing `apps/hyperlocalise-web` sandbox create or screenshot paths
- Removing bootstrap
- Using the image for Vercel Functions
