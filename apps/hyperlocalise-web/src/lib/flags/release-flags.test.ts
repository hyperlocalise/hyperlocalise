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
import { describe, expect, it, vi } from "vite-plus/test";

const releaseFlagRunMocks = vi.hoisted(() => ({
  catAllFiles: vi.fn(),
  sandboxVcrImage: vi.fn(),
}));

vi.mock("flags/next", () => ({
  flag: (definition: { key: string }) => {
    const run =
      definition.key === "release-sandbox-vcr-image"
        ? releaseFlagRunMocks.sandboxVcrImage
        : releaseFlagRunMocks.catAllFiles;
    return Object.assign(vi.fn(), {
      run,
      key: definition.key,
    });
  },
}));

import { isReleaseCatAllFilesEnabled, isReleaseSandboxVcrImageEnabled } from "./release-flags";

describe("isReleaseCatAllFilesEnabled", () => {
  it("passes providerKind into flag.run identify entities", async () => {
    releaseFlagRunMocks.catAllFiles.mockResolvedValue(true);

    await expect(isReleaseCatAllFilesEnabled("crowdin")).resolves.toBe(true);

    expect(releaseFlagRunMocks.catAllFiles).toHaveBeenCalledWith({
      identify: { providerKind: "crowdin" },
    });
  });

  it("normalizes omitted providerKind to null for native projects", async () => {
    releaseFlagRunMocks.catAllFiles.mockResolvedValue(true);

    await expect(isReleaseCatAllFilesEnabled()).resolves.toBe(true);

    expect(releaseFlagRunMocks.catAllFiles).toHaveBeenCalledWith({
      identify: { providerKind: null },
    });
  });

  it("returns false when flag evaluation throws", async () => {
    releaseFlagRunMocks.catAllFiles.mockRejectedValue(new Error("flags unavailable"));

    await expect(isReleaseCatAllFilesEnabled("crowdin")).resolves.toBe(false);
  });
});

describe("isReleaseSandboxVcrImageEnabled", () => {
  it("returns the flag.run result", async () => {
    releaseFlagRunMocks.sandboxVcrImage.mockResolvedValue(true);

    await expect(isReleaseSandboxVcrImageEnabled()).resolves.toBe(true);

    expect(releaseFlagRunMocks.sandboxVcrImage).toHaveBeenCalledWith({ identify: {} });
  });

  it("returns false when flag evaluation throws", async () => {
    releaseFlagRunMocks.sandboxVcrImage.mockRejectedValue(new Error("flags unavailable"));

    await expect(isReleaseSandboxVcrImageEnabled()).resolves.toBe(false);
  });
});
