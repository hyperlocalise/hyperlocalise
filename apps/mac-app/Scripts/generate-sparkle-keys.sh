#!/usr/bin/env bash
# Generate a Sparkle EdDSA keypair for signing update archives.
# Requires macOS and a Sparkle release that includes generate_keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${SPARKLE_KEYS_DIR:-$ROOT/.sparkle-keys}"
mkdir -p "$OUT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Sparkle key generation requires macOS (generate_keys is a Mac binary)." >&2
  exit 1
fi

GENERATE_KEYS="${GENERATE_KEYS:-}"
if [[ -z "$GENERATE_KEYS" ]]; then
  if command -v generate_keys >/dev/null 2>&1; then
    GENERATE_KEYS="$(command -v generate_keys)"
  else
    echo "Set GENERATE_KEYS to Sparkle's generate_keys binary, e.g.:" >&2
    echo "  GENERATE_KEYS=/path/to/Sparkle-2.x/bin/generate_keys $0" >&2
    echo "Download Sparkle from https://github.com/sparkle-project/Sparkle/releases" >&2
    exit 1
  fi
fi

cd "$OUT_DIR"
"$GENERATE_KEYS"

echo
echo "Keys written under $OUT_DIR (do not commit the private key)."
echo "1. Copy the public key into Config/Debug.xcconfig and Config/Release.xcconfig as SU_PUBLIC_ED_KEY."
echo "2. Store the private key in CI secrets for sign_update."
echo "3. Keep SU_FEED_URL pointed at your hosted appcast."
