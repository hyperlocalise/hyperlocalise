import { describe, expect, it } from "vite-plus/test";

import {
  installRequiredSandboxToolsCommand,
  sandboxHyperlocaliseReleaseVersion,
  sandboxRipgrepReleaseVersion,
} from "@/lib/vercel-sandbox-config";

describe("installRequiredSandboxToolsCommand", () => {
  it("installs ripgrep via apt on Debian-based sandboxes", () => {
    expect(installRequiredSandboxToolsCommand).toContain(
      "apt-get update && apt-get install -y ripgrep",
    );
  });

  it("falls back to GitHub releases when dnf cannot install ripgrep", () => {
    expect(installRequiredSandboxToolsCommand).toContain(
      "dnf install -y ripgrep || install_ripgrep_from_github_release",
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      `RG_VERSION="${sandboxRipgrepReleaseVersion}"`,
    );
    expect(installRequiredSandboxToolsCommand).toContain("x86_64-unknown-linux-musl");
    expect(installRequiredSandboxToolsCommand).toContain("aarch64-unknown-linux-gnu");
    expect(installRequiredSandboxToolsCommand).toContain(
      "https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/ripgrep-${RG_VERSION}-${RG_ARCH}.tar.gz",
    );
  });

  it("installs hyperlocalise from pinned GitHub releases", () => {
    expect(installRequiredSandboxToolsCommand).toContain(
      `HL_VERSION="${sandboxHyperlocaliseReleaseVersion}"`,
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      "install_hyperlocalise_from_github_release",
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      "hyperlocalise_${HL_VERSION}_linux_${HL_ARCH}.tar.gz",
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      "ln -sfn /usr/local/bin/hyperlocalise /usr/local/bin/hl",
    );
    expect(installRequiredSandboxToolsCommand).toContain("command -v hl >/dev/null 2>&1");
  });
});
