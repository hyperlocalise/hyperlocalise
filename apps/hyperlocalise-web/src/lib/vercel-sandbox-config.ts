/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Sandbox } from "@vercel/sandbox";

import { env } from "@/lib/env";
import {
  isHyperlocaliseSandboxVcrImageEnabledForScope,
  type VercelSandboxImageScope,
} from "@/lib/flags/release-flags";

export type { VercelSandboxImageScope } from "@/lib/flags/release-flags";

/** Pinned ripgrep release used when package managers do not ship rg (e.g. Amazon Linux 2023). */
export const sandboxRipgrepReleaseVersion = "15.2.0";

/** Pinned hyperlocalise CLI release installed into every sandbox. */
export const sandboxHyperlocaliseReleaseVersion = "1.13.2";

/**
 * Pinned Playwright release used for Debian/Ubuntu `install-deps` fallback.
 * Also used as `MANAGED_PLAYWRIGHT_VERSION` in capture-screenshot.ts.
 */
export const sandboxPlaywrightVersion = "1.63.0";

/**
 * Amazon Linux 2023 packages required to run Playwright's Ubuntu Chromium
 * build. Vercel Sandbox is AL2023 (`dnf`); Playwright's `install-deps` assumes
 * `apt-get` and fails there.
 */
export const sandboxChromiumDnfPackages = [
  "nspr",
  "nss",
  "atk",
  "at-spi2-atk",
  "at-spi2-core",
  "cups-libs",
  "libdrm",
  "libxkbcommon",
  "mesa-libgbm",
  "libX11",
  "libXcomposite",
  "libXcursor",
  "libXdamage",
  "libXext",
  "libXi",
  "libXrandr",
  "libXScrnSaver",
  "libXtst",
  "gtk3",
  "pango",
  "alsa-lib",
  "xorg-x11-server-Xvfb",
] as const;

type VercelSandboxCreateOptions = Parameters<typeof Sandbox.create>[0];

export type ConfiguredVercelSandboxCreateOptions = VercelSandboxCreateOptions & {
  /** Which release gates may select `VERCEL_SANDBOX_IMAGE`. Defaults to `default`. */
  imageScope?: VercelSandboxImageScope;
};

/**
 * Default managed image for sandboxes that do not opt into the custom VCR
 * image. `@vercel/sandbox` v3 deprecates `runtime`; use the Ubuntu Node 26
 * image equivalent of the former `runtime: "node26"` default.
 */
export const defaultVercelSandboxImage = "vercel/sandbox/node:26";

/** @deprecated Prefer {@link defaultVercelSandboxImage}. */
export const defaultVercelSandboxRuntime = "node26";

/**
 * Sandboxes are persistent by default, so every `stop()` (including the
 * stop/resume recovery path) can mint a snapshot. Expire them on the same
 * horizon the snapshot cleanup cron sweeps so storage stays bounded even if the
 * cron is paused.
 */
export const sandboxSnapshotExpirationMs = 3 * 24 * 60 * 60 * 1000;

/** Snapshots retained per sandbox; older ones are evicted as new ones are created. Vercel allows 1-10. */
export const sandboxSnapshotRetentionCount = 3;

const installRipgrepFromGithubRelease = [
  "install_ripgrep_from_github_release() {",
  `  RG_VERSION="${sandboxRipgrepReleaseVersion}"`,
  '  ARCH="$(uname -m)"',
  '  case "$ARCH" in',
  '    x86_64) RG_ARCH="x86_64-unknown-linux-musl" ;;',
  '    aarch64|arm64) RG_ARCH="aarch64-unknown-linux-gnu" ;;',
  '    *) echo "Unsupported architecture for ripgrep install: $ARCH" >&2; return 1 ;;',
  "  esac",
  "  if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then",
  '    echo "curl and tar are required to install ripgrep from GitHub releases." >&2',
  "    return 1",
  "  fi",
  '  RG_TMP_DIR="$(mktemp -d)"',
  "  trap 'rm -rf \"$RG_TMP_DIR\"' EXIT",
  '  cd "$RG_TMP_DIR" || return 1',
  '  curl -fsSL -o rg.tar.gz "https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/ripgrep-${RG_VERSION}-${RG_ARCH}.tar.gz"',
  "  tar -xzf rg.tar.gz",
  '  install -m 0755 "ripgrep-${RG_VERSION}-${RG_ARCH}/rg" /usr/local/bin/rg',
  "}",
].join("\n");

const installHyperlocaliseFromGithubRelease = [
  "install_hyperlocalise_from_github_release() {",
  `  HL_VERSION="${sandboxHyperlocaliseReleaseVersion}"`,
  '  HL_TAG="v${HL_VERSION}"',
  '  ARCH="$(uname -m)"',
  '  case "$ARCH" in',
  '    x86_64) HL_ARCH="amd64" ;;',
  '    aarch64|arm64) HL_ARCH="arm64" ;;',
  '    *) echo "Unsupported architecture for hyperlocalise install: $ARCH" >&2; return 1 ;;',
  "  esac",
  "  if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then",
  '    echo "curl and tar are required to install hyperlocalise from GitHub releases." >&2',
  "    return 1",
  "  fi",
  '  HL_TMP_DIR="$(mktemp -d)"',
  "  trap 'rm -rf \"$HL_TMP_DIR\"' EXIT",
  '  cd "$HL_TMP_DIR" || return 1',
  '  ARCHIVE="hyperlocalise_${HL_VERSION}_linux_${HL_ARCH}.tar.gz"',
  '  if ! curl -fsSL -o "${ARCHIVE}" "https://github.com/hyperlocalise/hyperlocalise/releases/download/${HL_TAG}/${ARCHIVE}"; then',
  '    curl -fsSL -o "${ARCHIVE}" "https://github.com/hyperlocalise/hyperlocalise/releases/download/${HL_VERSION}/${ARCHIVE}" || return 1',
  "  fi",
  '  tar -xzf "${ARCHIVE}" hyperlocalise',
  "  install -m 0755 hyperlocalise /usr/local/bin/hyperlocalise",
  "  ln -sfn /usr/local/bin/hyperlocalise /usr/local/bin/hl",
  "}",
].join("\n");

/** Shell function used by sandbox bootstrap and screenshot capture-time retry. */
export const installChromiumSystemDependenciesFunction = [
  "install_chromium_system_dependencies() {",
  "  run_as_root() {",
  '    if [ "$(id -u)" -eq 0 ]; then',
  '      "$@"',
  "    elif command -v sudo >/dev/null 2>&1; then",
  '      sudo "$@"',
  "    else",
  '      "$@"',
  "    fi",
  "  }",
  // Prefer dnf: Vercel Sandbox is Amazon Linux 2023. Playwright install-deps
  // falls back to ubuntu packages and shells out to apt-get (missing here).
  "  if command -v dnf >/dev/null 2>&1; then",
  `    run_as_root dnf install -y ${sandboxChromiumDnfPackages.join(" ")}`,
  "    return $?",
  "  fi",
  `  PW_VERSION="${sandboxPlaywrightVersion}"`,
  "  if command -v npm >/dev/null 2>&1; then",
  '    run_as_root npx --yes "playwright@${PW_VERSION}" install-deps chromium',
  "    return $?",
  "  fi",
  "  if command -v apt-get >/dev/null 2>&1; then",
  "    run_as_root apt-get update && run_as_root apt-get install -y libnspr4 libnss3",
  "    return $?",
  "  fi",
  '  echo "Unable to install Chromium system dependencies (dnf/npm/apt-get unavailable)." >&2',
  "  return 1",
  "}",
].join("\n");

export const installRequiredSandboxToolsCommand = [
  installRipgrepFromGithubRelease,
  installHyperlocaliseFromGithubRelease,
  installChromiumSystemDependenciesFunction,
  // The default Ubuntu image ships without curl, which the GitHub release
  // installers below and attachment downloads rely on.
  "if ! command -v curl >/dev/null 2>&1; then",
  "  if command -v apt-get >/dev/null 2>&1; then",
  "    apt-get update && apt-get install -y curl ca-certificates",
  "  elif command -v dnf >/dev/null 2>&1; then",
  "    dnf install -y curl",
  "  fi",
  "fi",
  "if ! command -v rg >/dev/null 2>&1; then",
  "  if command -v apt-get >/dev/null 2>&1; then",
  "    apt-get update && apt-get install -y ripgrep",
  "  elif command -v dnf >/dev/null 2>&1; then",
  "    dnf install -y ripgrep || install_ripgrep_from_github_release",
  "  elif command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then",
  "    install_ripgrep_from_github_release",
  "  else",
  '    echo "No supported package manager found for installing ripgrep." >&2',
  "    exit 1",
  "  fi",
  "fi",
  "command -v rg >/dev/null 2>&1",
  "if ! command -v hl >/dev/null 2>&1; then",
  "  install_hyperlocalise_from_github_release",
  "fi",
  "command -v hl >/dev/null 2>&1",
  // Playwright Chromium needs OS libs such as libnspr4.so; install during bootstrap
  // where sudo is available. Skip when already present (warm/reused images).
  // Best-effort: capture-time retry handles missing deps if this fails.
  "if command -v ldconfig >/dev/null 2>&1 && ! ldconfig -p 2>/dev/null | grep -q 'libnspr4\\.so'; then",
  "  install_chromium_system_dependencies || true",
  "fi",
].join("\n");

/** Ensures Hunspell and the pinned dictionary set are available for QA CLI spelling checks. */
export const installQaSpellingSandboxCommand = [
  'DICPATH="${DICPATH:-/usr/share/hunspell}"',
  'HUNSPELL_DICTIONARY_SHA256SUMS="${HUNSPELL_DICTIONARY_SHA256SUMS:-/usr/share/doc/hunspell-dictionaries/SHA256SUMS}"',
  "run_as_root() {",
  '  if [ "$(id -u)" -eq 0 ]; then',
  '    "$@"',
  "  elif command -v sudo >/dev/null 2>&1; then",
  '    sudo "$@"',
  "  else",
  '    "$@"',
  "  fi",
  "}",
  "hunspell_baked_dictionaries_ready() {",
  "  command -v hunspell >/dev/null 2>&1 || return 1",
  '  [ -f "$HUNSPELL_DICTIONARY_SHA256SUMS" ] || return 1',
  '  (cd "$DICPATH" && sha256sum -c --quiet "$HUNSPELL_DICTIONARY_SHA256SUMS")',
  "}",
  "install_hunspell_fetch_dependencies() {",
  "  if command -v dnf >/dev/null 2>&1; then",
  "    run_as_root dnf install -y hunspell curl tar gawk findutils",
  "  elif command -v apt-get >/dev/null 2>&1; then",
  "    run_as_root apt-get update && run_as_root apt-get install -y hunspell curl tar gawk findutils",
  "  else",
  '    echo "No supported package manager found for installing Hunspell." >&2',
  "    return 1",
  "  fi",
  "}",
  "hunspell_manifest_dictionaries_ready() {",
  '  local manifest="$1"',
  "  command -v hunspell >/dev/null 2>&1 || return 1",
  '  [ -f "$manifest" ] || return 1',
  "  local rows missing=0",
  "  rows=\"$(awk '",
  '    BEGIN { FS = "|" }',
  "    /^## Supported locales/ { intable = 1; next }",
  "    intable && /^## / { intable = 0 }",
  "    intable && /^\\| `/ {",
  "        aff = $3; dic = $4",
  '        gsub(/^[ \\t]+|[ \\t]+$/, "", aff); gsub(/`/, "", aff)',
  '        gsub(/^[ \\t]+|[ \\t]+$/, "", dic); gsub(/`/, "", dic)',
  '        print aff "\\t" dic',
  "    }",
  '  \' "$manifest")"',
  '  [ -n "$rows" ] || return 1',
  "  while IFS=$'\\t' read -r aff dic; do",
  '    if [ ! -f "$DICPATH/$aff" ] || [ ! -f "$DICPATH/$dic" ]; then',
  "      missing=$((missing + 1))",
  "    fi",
  '  done <<<"$rows"',
  '  [ "$missing" -eq 0 ]',
  "}",
  "if hunspell_baked_dictionaries_ready; then",
  "  exit 0",
  "fi",
  "install_hunspell_fetch_dependencies || exit 1",
  'REPO_ROOT="$(mktemp -d)"',
  'MANIFEST="$REPO_ROOT/internal/i18n/spellcheck/DICTIONARIES.md"',
  'mkdir -p "$REPO_ROOT/internal/i18n/spellcheck" "$REPO_ROOT/apps/go-svc/build"',
  `HL_TAG="v${sandboxHyperlocaliseReleaseVersion}"`,
  'curl -fsSL "https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/${HL_TAG}/internal/i18n/spellcheck/DICTIONARIES.md" -o "$MANIFEST" ||',
  `  curl -fsSL "https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/v${sandboxHyperlocaliseReleaseVersion}/internal/i18n/spellcheck/DICTIONARIES.md" -o "$MANIFEST"`,
  'curl -fsSL "https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/${HL_TAG}/apps/go-svc/build/fetch-dictionaries.sh" -o "$REPO_ROOT/apps/go-svc/build/fetch-dictionaries.sh" ||',
  `  curl -fsSL "https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/v${sandboxHyperlocaliseReleaseVersion}/apps/go-svc/build/fetch-dictionaries.sh" -o "$REPO_ROOT/apps/go-svc/build/fetch-dictionaries.sh"`,
  'chmod +x "$REPO_ROOT/apps/go-svc/build/fetch-dictionaries.sh"',
  'if hunspell_manifest_dictionaries_ready "$MANIFEST"; then',
  "  exit 0",
  "fi",
  'run_as_root mkdir -p "$DICPATH"',
  'run_as_root bash "$REPO_ROOT/apps/go-svc/build/fetch-dictionaries.sh" "$REPO_ROOT" "$DICPATH" "$(mktemp -d)"',
  'hunspell_manifest_dictionaries_ready "$MANIFEST"',
].join("\n");

export async function createConfiguredVercelSandbox(
  options: ConfiguredVercelSandboxCreateOptions = {},
): Promise<Sandbox> {
  const { imageScope = "default", ...sandboxCreateOptions } = options;
  const callerChoosesImageOrRuntime =
    "runtime" in sandboxCreateOptions ||
    "image" in sandboxCreateOptions ||
    sandboxCreateOptions.source?.type === "snapshot";
  const vcrSandboxImage = env.VERCEL_SANDBOX_IMAGE;
  const shouldUseVcrImage =
    !callerChoosesImageOrRuntime &&
    vcrSandboxImage != null &&
    vcrSandboxImage.length > 0 &&
    (await isHyperlocaliseSandboxVcrImageEnabledForScope(imageScope));
  const shouldUseDefaultImage = !callerChoosesImageOrRuntime && !shouldUseVcrImage;
  const createOptions = {
    ...sandboxCreateOptions,
    ...(shouldUseVcrImage ? { image: vcrSandboxImage } : {}),
    ...(shouldUseDefaultImage ? { image: defaultVercelSandboxImage } : {}),
    ...("snapshotExpiration" in sandboxCreateOptions
      ? {}
      : { snapshotExpiration: sandboxSnapshotExpirationMs }),
    ...("keepLastSnapshots" in sandboxCreateOptions
      ? {}
      : {
          keepLastSnapshots: {
            count: sandboxSnapshotRetentionCount,
            deleteEvicted: true,
          },
        }),
  } as VercelSandboxCreateOptions;

  const sandbox = await Sandbox.create(createOptions);

  const installResult = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", installRequiredSandboxToolsCommand],
    sudo: true,
  });
  if (installResult.exitCode !== 0) {
    throw new Error(`sandbox tool installation failed: ${await installResult.output("both")}`);
  }

  return sandbox;
}
