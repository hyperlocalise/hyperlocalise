# Sandbox image

Custom [Vercel Sandbox](https://vercel.com/docs/sandbox/concepts/images) image
published to [Vercel Container Registry (VCR)](https://vercel.com/docs/container-registry).

Today every sandbox boots the managed `vercel/sandbox/node:26` image, then
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
| Hunspell (`hunspell`) | apt |
| Hunspell dictionaries (20 locales) | pinned by [`DICTIONARIES.md`](../../internal/i18n/spellcheck/DICTIONARIES.md), under `/usr/share/hunspell` |

Keep those `ARG`s aligned with
`apps/hyperlocalise-web/src/lib/vercel-sandbox-config.ts`.

## Hunspell

The build context is the **repository root** (not this directory) so a first
stage can run [`apps/go-svc/build/fetch-dictionaries.sh`](../go-svc/build/fetch-dictionaries.sh) —
the same script [`Dockerfile.vercel`](../../Dockerfile.vercel) uses for
`go-svc`. Both images therefore carry byte-identical dictionaries for the
locales in [`DICTIONARIES.md`](../../internal/i18n/spellcheck/DICTIONARIES.md),
verified against pinned upstream commits and SHA-256 checksums.

| Path | Contents |
|------|----------|
| `/usr/share/hunspell` | 20 `.aff`/`.dic` pairs; also exported as `DICPATH` so `hunspell -d en_US` works without an absolute path |
| `/usr/share/doc/hunspell-dictionaries/<locale>` | licence evidence, required because the dictionaries are redistributed under GPL/LGPL/MPL terms |
| `/usr/share/doc/hunspell-dictionaries/SHA256SUMS` | checksums of the staged dictionaries, asserted at build time |

The apt `hunspell` package depends on `hunspell-en-us`, which ships its own
`en_US` into `/usr/share/hunspell`. The pinned set has to win, which today it
does only because the `COPY` runs after the apt install. Rather than rely on
that ordering, the build verifies the shipped files against `SHA256SUMS` and
fails if anything replaced them — so moving those steps breaks the build
instead of silently swapping a dictionary.

Dictionary basenames do **not** always follow the BCP 47 tag: `de-DE` maps to
`de_DE_frami` and `fr-FR` to `fr`. Resolve them through
`spellcheck.LoadRegistry()` rather than transforming the tag.

Four dictionaries declare legacy 8-bit encodings (`de_DE_frami` and `id_ID`
ISO8859-1, `ms_MY` ISO8859-1, `pl_PL` ISO8859-2). The `hunspell` binary
transcodes these itself, so pass `-i UTF-8` and send UTF-8 words; no
caller-side transcoding is needed. The CGO wrapper in
[`apps/go-svc/internal/hunspell`](../go-svc/internal/hunspell) still needs its
own transcoding because it talks to the C API directly.

Rebuild and push the image when `DICTIONARIES.md` or `fetch-dictionaries.sh`
changes; the workflow triggers on both paths.

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
| `VERCEL_TEAM_ID` | repository secret | Docker login username (`team_…`) |
| `VERCEL_TEAM_SLUG` | repository secret | Image path team slug |
| `VERCEL_PROJECT_SLUG` | repository secret | Image path project slug (hyperlocalise-web) |

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

Build from the repository root, since the build context is the root:

```bash
docker build --platform linux/amd64 \
  -f apps/sandbox-image/Dockerfile -t hyperlocalise-sandbox:local .

docker run --rm hyperlocalise-sandbox:local rg --version
docker run --rm hyperlocalise-sandbox:local volta --version
docker run --rm hyperlocalise-sandbox:local hl --help
docker run --rm hyperlocalise-sandbox:local \
  node -e "require('/tmp/hyperlocalise-browser-runtime/node_modules/playwright'); console.log('ok')"
```

[`verify-hunspell.sh`](verify-hunspell.sh) checks every locale in the manifest:
that the `.aff`/`.dic` pair is readable by the `ubuntu` user, that Hunspell
reports it loaded, and that its word list is non-empty. The last check matters
because Hunspell loads an **empty** word list — silently flagging every word —
when it cannot parse the word-count header on the first `.dic` line.

```bash
docker run --rm -v "$PWD/apps/sandbox-image/verify-hunspell.sh:/verify.sh:ro" \
  hyperlocalise-sandbox:local bash /verify.sh
```

## App cutover

Set both on the web app deployment:

```text
VERCEL_SANDBOX_IMAGE=vcr.vercel.com/<team-slug>/<project-slug>/hyperlocalise-sandbox:latest
RELEASE_SANDBOX_VCR_IMAGE=true
```

`RELEASE_SANDBOX_VCR_IMAGE` backs Flags SDK release flag
`release-sandbox-vcr-image`. When the flag is on and the image env is set,
`createConfiguredVercelSandbox` uses that image instead of
`vercel/sandbox/node:26`. See
[`docs/adr/2026-08-08-sandbox-vcr-image-release-flag-design.md`](../../docs/adr/2026-08-08-sandbox-vcr-image-release-flag-design.md).

## Notes

- Sandbox does not run Docker `ENTRYPOINT` / `CMD`. Start work with
  `sandbox.runCommand()`.
- Rebuild and push when bumping ripgrep, Playwright, or the CLI pin.
- Do not use this image for Vercel Functions; it targets Sandbox only.
