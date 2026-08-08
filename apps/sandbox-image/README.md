# Sandbox image

Custom [Vercel Sandbox](https://vercel.com/docs/sandbox/concepts/images) image
published to [Vercel Container Registry (VCR)](https://vercel.com/docs/container-registry).

Today every sandbox boots the managed `node26` runtime, then
`createConfiguredVercelSandbox` installs ripgrep, the `hl` CLI, and Chromium
system libraries over the network. Screenshot capture then installs Playwright
into a temp directory. This image bakes those tools in so sandboxes can start
ready once the app is wired to use it.

## Contents

Built from public **`ubuntu:26.04`** (same foundation as
[`vercel/sandbox/ubuntu`](https://github.com/vercel/sandbox/tree/main/images/ubuntu)),
not `FROM vercel/sandbox/universal`. Managed VCR images return **401** on
unauthenticated pulls, which breaks fork/PR CI that cannot use registry secrets.

Layout matches Vercel Sandbox conventions (`ubuntu` user, `HOME=/vercel`,
passwordless sudo), with:

| Tool | Version source |
|------|----------------|
| Node.js + npm + pnpm 11 | latest of major `NODE_MAJOR` (default **24**) |
| ripgrep (`rg`) | apt |
| Volta | `/vercel/.volta` (`VOLTA_VERSION` optional pin) |
| hyperlocalise CLI (`hl`) | pinned (`HYPERLOCALISE_VERSION`) |
| Playwright + Chromium | pinned (`PLAYWRIGHT_VERSION`), under `/tmp/hyperlocalise-browser-runtime` |

Keep those `ARG`s aligned with
`apps/hyperlocalise-web/src/lib/vercel-sandbox-config.ts`.

## CI

Workflow: [`.github/workflows/sandbox-image.yml`](../../.github/workflows/sandbox-image.yml)

| Event | Behavior |
|-------|----------|
| PR touching `apps/sandbox-image/**` | Build `linux/amd64` only, tag `hyperlocalise-sandbox:ci` (no registry auth) |
| Push to `main` / `workflow_dispatch` | Authenticate to VCR, build and push `:sha` + `:latest` |

PR / fork builds do **not** require repository secrets (forks cannot read them).
Registry login and credential checks run only when pushing. The base OS image
is public, so the Dockerfile build itself does not need VCR.

### Required GitHub configuration (push / `workflow_dispatch` only)

| Name | Kind | Purpose |
|------|------|---------|
| `VERCEL_TOKEN` | repository secret | Vercel access token with access to the web project |
| `VERCEL_TEAM_ID` | repository variable | Docker login username (`team_…`) |
| `VERCEL_TEAM_SLUG` | repository variable | Image path team slug |
| `VERCEL_PROJECT_SLUG` | repository variable | Image path project slug (hyperlocalise-web) |

Pushed reference:

```text
vcr.vercel.com/<VERCEL_TEAM_SLUG>/<VERCEL_PROJECT_SLUG>/hyperlocalise-sandbox:latest
```

## Local build and push

```bash
cd apps/sandbox-image

# Authenticate Docker to VCR (OIDC, 12h credentials)
vercel link   # if not already linked to hyperlocalise-web
vercel vcr login docker

# Build + push (recommended)
vercel vcr build docker . hyperlocalise-sandbox:latest --push
```

Or with Docker Buildx:

```bash
IMAGE=vcr.vercel.com/<team-slug>/<project-slug>/hyperlocalise-sandbox:latest

docker buildx build \
  --platform linux/amd64 \
  --output "type=image,name=${IMAGE},push=true,oci-mediatypes=true,compression=zstd,compression-level=3,force-compression=true" \
  --push \
  .
```

Sandbox only accepts prepared `linux/amd64` images. After push, wait until the
repository shows **Ready** in the project Images dashboard.

## Local smoke test

```bash
docker build --platform linux/amd64 -t hyperlocalise-sandbox:local .
docker run --rm hyperlocalise-sandbox:local rg --version
docker run --rm hyperlocalise-sandbox:local volta --version
docker run --rm hyperlocalise-sandbox:local hl --help
docker run --rm hyperlocalise-sandbox:local \
  node -e "require('/tmp/hyperlocalise-browser-runtime/node_modules/playwright'); console.log('ok')"
```

## Notes

- App wiring (`Sandbox.create({ image })`) is intentionally out of scope here.
- Sandbox does not run Docker `ENTRYPOINT` / `CMD`. Start work with
  `sandbox.runCommand()`.
- Rebuild and push when bumping ripgrep, Playwright, or the CLI pin.
- Do not use this image for Vercel Functions; it targets Sandbox only.
