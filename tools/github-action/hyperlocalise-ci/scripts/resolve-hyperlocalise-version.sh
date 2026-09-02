#!/usr/bin/env bash
set -euo pipefail

requested="${1:-latest}"
config_path="${2:-i18n.yml}"
working_directory="${3:-.}"
repo_root="${GITHUB_ACTION_PATH:-${GITHUB_WORKSPACE:-.}}"

if [[ "${requested}" != "config" ]]; then
  printf '%s\n' "${requested}"
  exit 0
fi

if ! command -v go >/dev/null 2>&1; then
  echo "Failed to resolve Hyperlocalise version from config: Go is required when hyperlocalise-version is set to config." >&2
  exit 1
fi

(
  cd "${repo_root}"
  go run ./tools/github-action/hyperlocalise-ci/cmd/resolve-config-version "${requested}" "${config_path}" "${working_directory}"
)
