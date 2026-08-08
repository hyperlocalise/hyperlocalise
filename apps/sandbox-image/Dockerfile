# syntax=docker/dockerfile:1
#
# Custom Vercel Sandbox image for Hyperlocalise agents.
# Extends the managed universal image (ripgrep, git, gh, bun, Node, …)
# and bakes tools we still install at runtime today: hyperlocalise CLI and
# Playwright Chromium.
#
# Build for linux/amd64 (Sandbox requirement), then push to Vercel Container
# Registry. See README.md in this directory.

ARG BASE_IMAGE=vcr.vercel.com/vercel/sandbox/universal:latest
FROM ${BASE_IMAGE}

USER root
ENV HOME=/root
ARG DEBIAN_FRONTEND=noninteractive

# Keep in sync with apps/hyperlocalise-web/src/lib/vercel-sandbox-config.ts
ARG HYPERLOCALISE_VERSION=1.8.24
ARG PLAYWRIGHT_VERSION=1.61.1
# Matches MANAGED_BROWSER_RUNTIME_DIR in capture-screenshot.ts (web wiring later).
ARG BROWSER_RUNTIME_DIR=/tmp/hyperlocalise-browser-runtime

# universal already ships ripgrep; assert it is on PATH.
RUN command -v rg && rg --version

RUN set -eux; \
    ARCHIVE="hyperlocalise_${HYPERLOCALISE_VERSION}_linux_amd64.tar.gz"; \
    TMP="$(mktemp -d)"; \
    if ! curl -fsSL -o "${TMP}/${ARCHIVE}" \
      "https://github.com/hyperlocalise/hyperlocalise/releases/download/v${HYPERLOCALISE_VERSION}/${ARCHIVE}"; then \
      curl -fsSL -o "${TMP}/${ARCHIVE}" \
        "https://github.com/hyperlocalise/hyperlocalise/releases/download/${HYPERLOCALISE_VERSION}/${ARCHIVE}"; \
    fi; \
    tar -xzf "${TMP}/${ARCHIVE}" -C "${TMP}" hyperlocalise; \
    install -m 0755 "${TMP}/hyperlocalise" /usr/local/bin/hyperlocalise; \
    ln -sfn /usr/local/bin/hyperlocalise /usr/local/bin/hl; \
    rm -rf "${TMP}"; \
    hl --help >/dev/null

# Playwright Chromium + OS libs. Path must match MANAGED_BROWSER_RUNTIME_DIR
# in capture-screenshot.ts so first screenshot skips npm/browser install.
RUN set -eux; \
    mkdir -p "${BROWSER_RUNTIME_DIR}"; \
    npm --prefix "${BROWSER_RUNTIME_DIR}" init -y >/dev/null; \
    npm --prefix "${BROWSER_RUNTIME_DIR}" install --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}"; \
    npx --yes "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium; \
    PLAYWRIGHT_BROWSERS_PATH="${BROWSER_RUNTIME_DIR}/ms-playwright" \
      "${BROWSER_RUNTIME_DIR}/node_modules/.bin/playwright" install chromium; \
    npm cache clean --force; \
    chown -R ubuntu:ubuntu "${BROWSER_RUNTIME_DIR}"

RUN chown -R ubuntu:ubuntu /vercel

ENV HOME=/vercel
ENV PLAYWRIGHT_BROWSERS_PATH=/tmp/hyperlocalise-browser-runtime/ms-playwright
USER ubuntu
WORKDIR /vercel

# Sandbox ignores ENTRYPOINT/CMD; keep image metadata for local docker runs.
CMD ["node", "--version"]
