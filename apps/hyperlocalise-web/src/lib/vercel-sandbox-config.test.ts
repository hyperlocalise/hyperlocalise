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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const sandboxMocks = vi.hoisted(() => ({
  create: vi.fn(),
  runCommand: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: sandboxMocks.create,
  },
}));

import {
  createConfiguredVercelSandbox,
  installRequiredSandboxToolsCommand,
  resolveVercelSandboxImage,
  sandboxChromiumDnfPackages,
  sandboxHyperlocaliseReleaseVersion,
  sandboxPlaywrightVersion,
  sandboxRipgrepReleaseVersion,
  sandboxSnapshotExpirationMs,
  sandboxSnapshotRetentionCount,
} from "@/lib/vercel-sandbox-config";

describe("installRequiredSandboxToolsCommand", () => {
  it("installs ripgrep via apt on Debian-based sandboxes", () => {
    expect(installRequiredSandboxToolsCommand).toContain(
      "apt-get update && apt-get install -y ripgrep",
    );
  });

  it("installs Chromium system libraries when libnspr4 is missing", () => {
    expect(installRequiredSandboxToolsCommand).toContain(
      "install_chromium_system_dependencies || true",
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      `run_as_root dnf install -y ${sandboxChromiumDnfPackages.join(" ")}`,
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      `PW_VERSION="${sandboxPlaywrightVersion}"`,
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      'run_as_root npx --yes "playwright@${PW_VERSION}" install-deps chromium',
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      "run_as_root apt-get update && run_as_root apt-get install -y libnspr4 libnss3",
    );
    expect(installRequiredSandboxToolsCommand).toContain(
      "if command -v ldconfig >/dev/null 2>&1 && ! ldconfig -p 2>/dev/null | grep -q 'libnspr4\\.so'; then",
    );
    // dnf must be preferred: Vercel Sandbox is Amazon Linux and has npm, but no apt-get.
    expect(installRequiredSandboxToolsCommand.indexOf("run_as_root dnf install -y")).toBeLessThan(
      installRequiredSandboxToolsCommand.indexOf(
        'run_as_root npx --yes "playwright@${PW_VERSION}" install-deps chromium',
      ),
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
    expect(installRequiredSandboxToolsCommand).toContain('RG_TMP_DIR="$(mktemp -d)"');
    expect(installRequiredSandboxToolsCommand).toContain("trap 'rm -rf \"$RG_TMP_DIR\"' EXIT");
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
    expect(installRequiredSandboxToolsCommand).toContain('HL_TMP_DIR="$(mktemp -d)"');
    expect(installRequiredSandboxToolsCommand).toContain("trap 'rm -rf \"$HL_TMP_DIR\"' EXIT");
    expect(installRequiredSandboxToolsCommand).toContain(
      'https://github.com/hyperlocalise/hyperlocalise/releases/download/${HL_VERSION}/${ARCHIVE}" || return 1',
    );
    expect(installRequiredSandboxToolsCommand).toContain("command -v hl >/dev/null 2>&1");
  });
});

describe("resolveVercelSandboxImage", () => {
  it("returns undefined when unset or blank", () => {
    expect(resolveVercelSandboxImage({})).toBeUndefined();
    expect(resolveVercelSandboxImage({ VERCEL_SANDBOX_IMAGE: "  " })).toBeUndefined();
  });

  it("trims a configured image reference", () => {
    expect(
      resolveVercelSandboxImage({ VERCEL_SANDBOX_IMAGE: " hyperlocalise-sandbox:latest " }),
    ).toBe("hyperlocalise-sandbox:latest");
  });
});

describe("createConfiguredVercelSandbox", () => {
  const originalSandboxImage = process.env.VERCEL_SANDBOX_IMAGE;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VERCEL_SANDBOX_IMAGE;
    sandboxMocks.runCommand.mockResolvedValue({ exitCode: 0, output: vi.fn() });
    sandboxMocks.create.mockResolvedValue({
      name: "sandbox_123",
      runCommand: sandboxMocks.runCommand,
    });
  });

  afterEach(() => {
    if (originalSandboxImage === undefined) {
      delete process.env.VERCEL_SANDBOX_IMAGE;
    } else {
      process.env.VERCEL_SANDBOX_IMAGE = originalSandboxImage;
    }
  });

  it("bounds snapshot growth with an expiration and retention policy", async () => {
    await createConfiguredVercelSandbox();

    expect(sandboxMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: "node26",
        snapshotExpiration: sandboxSnapshotExpirationMs,
        keepLastSnapshots: { count: sandboxSnapshotRetentionCount, deleteEvicted: true },
      }),
    );
  });

  it("uses VERCEL_SANDBOX_IMAGE instead of the default runtime", async () => {
    process.env.VERCEL_SANDBOX_IMAGE = "hyperlocalise-sandbox:latest";

    await createConfiguredVercelSandbox();

    expect(sandboxMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        image: "hyperlocalise-sandbox:latest",
      }),
    );
    expect(sandboxMocks.create.mock.calls[0]?.[0]).not.toHaveProperty("runtime");
  });

  it("keeps caller-supplied snapshot settings", async () => {
    await createConfiguredVercelSandbox({
      snapshotExpiration: 0,
      keepLastSnapshots: { count: 1 },
    });

    expect(sandboxMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotExpiration: 0,
        keepLastSnapshots: { count: 1 },
      }),
    );
  });
});
