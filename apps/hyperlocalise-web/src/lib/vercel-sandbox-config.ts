import { Sandbox } from "@vercel/sandbox";

/** Pinned ripgrep release used when package managers do not ship rg (e.g. Amazon Linux 2023). */
export const sandboxRipgrepReleaseVersion = "14.1.1";

/** Pinned hyperlocalise CLI release installed into every sandbox. */
export const sandboxHyperlocaliseReleaseVersion = "1.8.23";

type VercelSandboxCreateOptions = Parameters<typeof Sandbox.create>[0];

export const defaultVercelSandboxRuntime = "node26";

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

export const installRequiredSandboxToolsCommand = [
  installRipgrepFromGithubRelease,
  installHyperlocaliseFromGithubRelease,
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
].join("\n");

export async function createConfiguredVercelSandbox(
  options: VercelSandboxCreateOptions = {},
): Promise<Sandbox> {
  const shouldUseDefaultRuntime =
    !("runtime" in options) && !("image" in options) && options.source?.type !== "snapshot";
  const createOptions: VercelSandboxCreateOptions = shouldUseDefaultRuntime
    ? ({
        ...options,
        runtime: defaultVercelSandboxRuntime,
      } as VercelSandboxCreateOptions)
    : options;

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
