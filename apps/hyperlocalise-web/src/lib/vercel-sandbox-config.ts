import { Sandbox } from "@vercel/sandbox";

/** Pinned ripgrep release used when package managers do not ship rg (e.g. Amazon Linux 2023). */
export const sandboxRipgrepReleaseVersion = "14.1.1";

type VercelSandboxCreateOptions = Parameters<typeof Sandbox.create>[0];

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
  '  TMP_DIR="$(mktemp -d)"',
  "  trap 'rm -rf \"$TMP_DIR\"' EXIT",
  '  cd "$TMP_DIR" || return 1',
  '  curl -fsSL -o rg.tar.gz "https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/ripgrep-${RG_VERSION}-${RG_ARCH}.tar.gz"',
  "  tar -xzf rg.tar.gz",
  '  install -m 0755 "ripgrep-${RG_VERSION}-${RG_ARCH}/rg" /usr/local/bin/rg',
  "}",
].join("\n");

export const installRequiredSandboxToolsCommand = [
  installRipgrepFromGithubRelease,
  "if command -v rg >/dev/null 2>&1; then exit 0; fi",
  "if command -v apt-get >/dev/null 2>&1; then",
  "  apt-get update && apt-get install -y ripgrep",
  "elif command -v dnf >/dev/null 2>&1; then",
  "  dnf install -y ripgrep || install_ripgrep_from_github_release",
  "elif command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then",
  "  install_ripgrep_from_github_release",
  "else",
  '  echo "No supported package manager found for installing ripgrep." >&2',
  "  exit 1",
  "fi",
  "command -v rg >/dev/null 2>&1",
].join("\n");

export async function createConfiguredVercelSandbox(
  options: VercelSandboxCreateOptions = {},
): Promise<Sandbox> {
  const sandbox = await Sandbox.create({
    ...options,
  });

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
