#!/usr/bin/env bash
# Starts workos-emulate for browser e2e. Downloads a pinned binary on first run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${WORKOS_EMULATE_VERSION:-0.5.0}"
PORT="${WORKOS_EMULATE_PORT:-4100}"
HOST="${WORKOS_EMULATE_HOST:-127.0.0.1}"
CACHE_DIR="${ROOT}/.cache/workos-emulate"
SEED="${ROOT}/e2e/workos-emulate.config.yaml"
SIGNING_KEY="${ROOT}/e2e/workos-emulate-signing-key"
KID="${WORKOS_EMULATE_KID:-hyperlocalise_e2e}"

OS="$(uname -s)"
ARCH="$(uname -m)"
case "${OS}" in
  Linux) PLATFORM="linux" ;;
  Darwin) PLATFORM="darwin" ;;
  *)
    echo "Unsupported OS: ${OS}" >&2
    exit 1
    ;;
esac
case "${ARCH}" in
  x86_64 | amd64) ARCH_LABEL="x64" ;;
  arm64 | aarch64) ARCH_LABEL="arm64" ;;
  *)
    echo "Unsupported architecture: ${ARCH}" >&2
    exit 1
    ;;
esac

ASSET="workos-emulate-${PLATFORM}-${ARCH_LABEL}"
BIN="${CACHE_DIR}/${ASSET}-${VERSION}"

if [[ ! -x "${BIN}" ]]; then
  mkdir -p "${CACHE_DIR}"
  URL="https://github.com/workos/emulate/releases/download/v${VERSION}/${ASSET}"
  echo "Downloading workos-emulate ${VERSION} (${ASSET})..."
  curl -fsSL -o "${BIN}.tmp" "${URL}"
  chmod +x "${BIN}.tmp"
  mv "${BIN}.tmp" "${BIN}"
fi

if [[ ! -f "${SIGNING_KEY}" ]]; then
  echo "Missing signing key at ${SIGNING_KEY}" >&2
  exit 1
fi

exec "${BIN}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --interactive \
  --seed "${SEED}" \
  --signing-key "${SIGNING_KEY}" \
  --kid "${KID}"
