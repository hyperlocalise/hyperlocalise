# Sandbox image

Custom [Vercel Sandbox](https://vercel.com/docs/sandbox/concepts/images) image
published to [Vercel Container Registry (VCR)](https://vercel.com/docs/container-registry).

Today every sandbox boots the managed `node26` runtime, then
`createConfiguredVercelSandbox` installs ripgrep, the `hl` CLI, and Chromium
system libraries over the network. Screenshot capture then installs Playwright
into a temp directory. This image bakes those tools in so sandboxes start ready.

## Contents

Built on `vercel/sandbox/node:26` (Ubuntu, Node 26, pnpm, passwordless sudo):

| Tool | Version source |
|------|----------------|
| ripgrep (`rg`) | pinned in Dockerfile (`RIPGREP_VERSION`) |
| hyperlocalise CLI (`hl`) | pinned (`HYPERLOCALISE_VERSION`) |
| Playwright + Chromium | pinned (`PLAYWRIGHT_VERSION`), under `/vercel/hyperlocalise-browser-runtime` |

Keep those `ARG`s aligned with
`apps/hyperlocalise-web/src/lib/vercel-sandbox-config.ts`.

## Prerequisites

- [Vercel CLI](https://vercel.com/docs/cli) linked to the hyperlocalise-web project
- Docker (or Podman) with Buildx

## Build and push

From the repository root (or this directory):

```bash
cd apps/sandbox-image

# Authenticate Docker to VCR (OIDC, 12h credentials)
vercel link   # if not already linked
vercel vcr login docker

# Build + push (recommended)
vercel vcr build docker . hyperlocalise-sandbox:latest --push
```

Or with Docker Buildx (zstd compression recommended by Vercel):

```bash
# Replace team-slug / project-slug with your Vercel team and project
IMAGE=vcr.vercel.com/team-slug/project-slug/hyperlocalise-sandbox:latest

docker buildx build \
  --platform linux/amd64 \
  --output "type=image,name=${IMAGE},push=true,oci-mediatypes=true,compression=zstd,compression-level=3,force-compression=true" \
  --push \
  .
```

Sandbox only accepts prepared `linux/amd64` images. After push, wait until the
repository shows **Ready** in the project Images dashboard (not Preparing /
Unoptimized).

## Use from the app

Set the image reference on the web app (project env or `.env`):

```bash
VERCEL_SANDBOX_IMAGE=hyperlocalise-sandbox:latest
```

Team-scoped and digest pins also work:

```bash
VERCEL_SANDBOX_IMAGE=team-slug/project-slug/hyperlocalise-sandbox@sha256:...
```

When `VERCEL_SANDBOX_IMAGE` is set, `createConfiguredVercelSandbox` passes
`image` to `Sandbox.create` instead of `runtime: "node26"`. Bootstrap still
runs, but becomes a fast no-op when `rg` / `hl` / Chromium libs are already
present.

## Local smoke test

```bash
docker build --platform linux/amd64 -t hyperlocalise-sandbox:local .
docker run --rm hyperlocalise-sandbox:local rg --version
docker run --rm hyperlocalise-sandbox:local hl --help
docker run --rm hyperlocalise-sandbox:local \
  node -e "require('/vercel/hyperlocalise-browser-runtime/node_modules/playwright'); console.log('ok')"
```

## Notes

- Sandbox does not run Docker `ENTRYPOINT` / `CMD`. Start work with
  `sandbox.runCommand()`.
- Rebuild and push when bumping ripgrep, Playwright, or the CLI pin.
- Do not use this image for Vercel Functions; it targets Sandbox only.
