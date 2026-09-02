#!/usr/bin/env bash
set -euo pipefail

requested="${1:-latest}"
config_path="${2:-i18n.yml}"

if [[ "${requested}" != "config" ]]; then
  printf '%s\n' "${requested}"
  exit 0
fi

if [[ ! -f "${config_path}" ]]; then
  echo "Failed to resolve Hyperlocalise version from config: ${config_path} does not exist." >&2
  exit 1
fi

pinned="$(
  awk -F: '
    /^[[:space:]]*version:[[:space:]]*/ {
      value = substr($0, index($0, ":") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^["'\'']|["'\'']$/, "", value)
      print value
      exit
    }
  ' "${config_path}"
)"

if [[ -z "${pinned}" ]]; then
  echo "Failed to resolve Hyperlocalise version from config: version is not set in ${config_path}." >&2
  exit 1
fi

case "${pinned}" in
  hyperlocalise@*|hl@*)
    printf '%s\n' "${pinned#*@}"
    ;;
  *)
    echo "Failed to resolve Hyperlocalise version from config: expected hyperlocalise@<version> or hl@<version>, got ${pinned}." >&2
    exit 1
    ;;
esac
