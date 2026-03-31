#!/usr/bin/env bash
set -euo pipefail

version="${1:-latest}"
install_dir="${2:?install dir is required}"
repo="hyperlocalise/hyperlocalise"
binary_name="hyperlocalise"
checksums="checksums.txt"

resolve_version() {
  local requested="$1"
  if [[ "${requested}" != "latest" ]]; then
    printf '%s\n' "${requested}"
    return
  fi

  local latest_release_json
  latest_release_json="$(curl -fsSL "https://api.github.com/repos/${repo}/releases/latest")"
  local resolved
  resolved="$(printf '%s' "${latest_release_json}" | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p' | awk 'NR==1{print; exit}')"
  if [[ -z "${resolved}" ]]; then
    echo "Failed to resolve the latest Hyperlocalise release tag." >&2
    exit 1
  fi
  printf '%s\n' "${resolved}"
}

make_tag_candidates() {
  if [[ "$1" == v* ]]; then
    printf '%s\n' "$1" "${1#v}"
  else
    printf '%s\n' "$1" "v$1"
  fi | awk '!seen[$0]++'
}

make_asset_version_candidates() {
  printf '%s\n' "${1#v}" "$1" | awk '!seen[$0]++'
}

resolved_version="$(resolve_version "${version}")"
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "${arch}" in
  x86_64) arch="amd64" ;;
  aarch64|arm64) arch="arm64" ;;
  *)
    echo "Unsupported architecture: ${arch}" >&2
    exit 1
    ;;
esac

case "${os}" in
  linux|darwin) ;;
  *)
    echo "Unsupported operating system: ${os}" >&2
    exit 1
    ;;
esac

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

archive=""
base_url=""

while IFS= read -r tag_candidate; do
  candidate_base_url="https://github.com/${repo}/releases/download/${tag_candidate}"
  while IFS= read -r asset_version_candidate; do
    candidate_archive="${binary_name}_${asset_version_candidate}_${os}_${arch}.tar.gz"
    if curl -fsSL "${candidate_base_url}/${candidate_archive}" -o "${tmp_dir}/${candidate_archive}"; then
      archive="${candidate_archive}"
      base_url="${candidate_base_url}"
      break 2
    fi
  done < <(make_asset_version_candidates "${resolved_version}")
done < <(make_tag_candidates "${resolved_version}")

if [[ -z "${archive}" ]]; then
  echo "Failed to download a Hyperlocalise release archive for ${resolved_version} (${os}/${arch})." >&2
  exit 1
fi

if curl -fsSL "${base_url}/${checksums}" -o "${tmp_dir}/${checksums}"; then
  expected_line="$(grep " ${archive}$" "${tmp_dir}/${checksums}" || true)"
  if [[ -z "${expected_line}" ]]; then
    echo "Checksum entry not found for ${archive}." >&2
    exit 1
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    (cd "${tmp_dir}" && printf '%s\n' "${expected_line}" | sha256sum -c -)
  elif command -v shasum >/dev/null 2>&1; then
    expected_hash="$(printf '%s' "${expected_line}" | awk '{print $1}')"
    actual_hash="$(shasum -a 256 "${tmp_dir}/${archive}" | awk '{print $1}')"
    if [[ "${expected_hash}" != "${actual_hash}" ]]; then
      echo "Checksum verification failed for ${archive}." >&2
      exit 1
    fi
  else
    echo "No SHA-256 verification tool is available." >&2
    exit 1
  fi
else
  echo "Warning: failed to download ${checksums}; skipping checksum verification." >&2
fi

mkdir -p "${install_dir}"
tar -xzf "${tmp_dir}/${archive}" -C "${tmp_dir}" "${binary_name}"
install -m 0755 "${tmp_dir}/${binary_name}" "${install_dir}/${binary_name}"
