# syntax=docker/dockerfile:1
#
# Custom Vercel Sandbox image for Hyperlocalise agents.
#
# Built from public ubuntu:26.04 (same foundation as vercel/sandbox/ubuntu) so
# CI can build without VCR credentials. Vercel managed images on
# vcr.vercel.com require auth to pull (401 unauthenticated), so we do not
# FROM vercel/sandbox/universal directly.
#
# Layout mirrors Vercel Sandbox conventions: ubuntu user, HOME=/vercel,
# passwordless sudo. Adds Node 24, ripgrep, Volta, hl, Playwright Chromium, and
# Hunspell with the pinned dictionary set.
#
# Build context is the repository root so the dictionary stage can reuse the
# manifest and staging script that Dockerfile.vercel uses for go-svc.
#
# Build for linux/amd64 (Sandbox requirement), then push to Vercel Container
# Registry. See README.md in this directory.

# Stage the approved Hunspell dictionaries with the same script the go-svc
# image runs, so both images carry byte-identical dictionaries for the locales
# in internal/i18n/spellcheck/DICTIONARIES.md.
FROM ubuntu:26.04 AS dictionaries

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gawk \
        tar \
    && rm -rf /var/lib/apt/lists/*

COPY internal/i18n/spellcheck/DICTIONARIES.md /repo/internal/i18n/spellcheck/DICTIONARIES.md
COPY apps/go-svc/build/fetch-dictionaries.sh /repo/apps/go-svc/build/fetch-dictionaries.sh

RUN bash /repo/apps/go-svc/build/fetch-dictionaries.sh /repo /dictionaries-staging/hunspell /dictionaries-staging/licenses

# Checksums of what was staged, so the runtime stage can prove the dictionaries
# it ends up with are these and not a distro package's.
RUN cd /dictionaries-staging/hunspell && sha256sum ./*.aff ./*.dic > /dictionaries-staging/SHA256SUMS

FROM ubuntu:26.04

USER root
ENV LANG=C.UTF-8
ENV HOME=/root
ARG DEBIAN_FRONTEND=noninteractive

# Keep in sync with apps/hyperlocalise-web/src/lib/vercel-sandbox-config.ts
ARG NODE_MAJOR=24
ARG HYPERLOCALISE_VERSION=1.9.1
ARG PLAYWRIGHT_VERSION=1.61.1
# Optional pin; omit / leave empty to install the latest Volta release.
ARG VOLTA_VERSION=
# Matches MANAGED_BROWSER_RUNTIME_DIR in capture-screenshot.ts (web wiring later).
ARG BROWSER_RUNTIME_DIR=/tmp/hyperlocalise-browser-runtime
# Hunspell's default search path; also exported as DICPATH so `hunspell -d en_US`
# resolves without an absolute path.
ARG HUNSPELL_DICT_DIR=/usr/share/hunspell

# Sandbox user + sudo (from vercel/sandbox/ubuntu).
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        hunspell \
        libarchive-tools \
        libatomic1 \
        ripgrep \
        sudo \
        tar \
    && rm -rf /var/lib/apt/lists/* \
    && printf '%s\n' \
        'Defaults always_set_home' \
        'Defaults !env_reset' \
        'Defaults !fqdn' \
        'ubuntu ALL=(ALL) NOPASSWD:ALL' \
        > /etc/sudoers.d/sandbox \
    && chmod 0440 /etc/sudoers.d/sandbox \
    && install -d -o ubuntu -g ubuntu /vercel \
    && usermod --home /vercel ubuntu \
    && chown -R ubuntu:ubuntu /vercel

# Node.js latest of the pinned major (same approach as vercel/sandbox/node).
RUN set -eux; \
    tarball="$(curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt" \
      | grep -oE 'node-v[0-9]+\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz' | head -n1)"; \
    mkdir -p /opt/node; \
    curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/${tarball}" \
      | bsdtar -xJ --strip-components=1 -C /opt/node; \
    rm -f /opt/node/CHANGELOG.md /opt/node/LICENSE /opt/node/README.md; \
    cp -a /opt/node/. /usr/local/; \
    npm install -g pnpm@11; \
    npm cache clean --force; \
    node --version; \
    npm --version; \
    pnpm --version; \
    rg --version

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

# Pinned dictionaries plus their licence evidence. The dictionaries are
# GPL/LGPL/MPL licensed and redistributed in this image, so the licence files
# must ship alongside them.
#
# This must stay after the apt install above: `hunspell` depends on
# hunspell-en-us, which ships its own en_US into the same directory, and these
# pinned files have to be the ones that survive.
COPY --from=dictionaries /dictionaries-staging/hunspell/ ${HUNSPELL_DICT_DIR}/
COPY --from=dictionaries /dictionaries-staging/licenses/ /usr/share/doc/hunspell-dictionaries/
COPY --from=dictionaries /dictionaries-staging/SHA256SUMS /usr/share/doc/hunspell-dictionaries/SHA256SUMS

# Fail the build if the shipped dictionaries are not the staged ones (a distro
# package winning the directory), if one is unreadable, or if a locale loses its
# encoding: en_US covers the ASCII path, de_DE_frami UTF-8 round-tripping.
RUN set -eux; \
    chmod -R a+rX "${HUNSPELL_DICT_DIR}" /usr/share/doc/hunspell-dictionaries; \
    (cd "${HUNSPELL_DICT_DIR}" && sha256sum -c --quiet /usr/share/doc/hunspell-dictionaries/SHA256SUMS); \
    [ "$(printf 'hello\nhelo\n' | hunspell -d "${HUNSPELL_DICT_DIR}/en_US" -l)" = "helo" ]; \
    [ "$(printf 'Stra\303\237e\nStrasze\n' | hunspell -d "${HUNSPELL_DICT_DIR}/de_DE_frami" -l)" = "Strasze" ]

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
ENV VOLTA_HOME=/vercel/.volta
ENV PATH="/vercel/.volta/bin:/vercel/.global/pnpm/bin:/vercel/.global/npm/bin:${PATH}"
ENV PLAYWRIGHT_BROWSERS_PATH=/tmp/hyperlocalise-browser-runtime/ms-playwright
ENV DICPATH=/usr/share/hunspell
USER ubuntu
WORKDIR /vercel

RUN mkdir -p ~/.global/npm ~/.global/pnpm \
    && npm config set prefix ~/.global/npm \
    && pnpm config set global-dir ~/.global/pnpm \
    && pnpm config set global-bin-dir ~/.global/pnpm/bin

# Install Volta for the sandbox user. PATH above covers non-login shells
# (Sandbox runCommand does not source profile scripts).
RUN set -eux; \
    if [ -n "${VOLTA_VERSION}" ]; then \
      curl -fsSL https://get.volta.sh | bash -s -- --skip-setup --version "${VOLTA_VERSION}"; \
    else \
      curl -fsSL https://get.volta.sh | bash -s -- --skip-setup; \
    fi; \
    volta --version

# Sandbox ignores ENTRYPOINT/CMD; keep image metadata for local docker runs.
CMD ["node", "--version"]
