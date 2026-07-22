/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it, vi } from "vite-plus/test";

const releaseCatAllFilesFlagRunMock = vi.hoisted(() => vi.fn());

vi.mock("flags/next", () => ({
  flag: () => {
    const flagFn = Object.assign(vi.fn(), {
      run: releaseCatAllFilesFlagRunMock,
      key: "release-cat-all-files",
    });
    return flagFn;
  },
}));

import { isReleaseCatAllFilesEnabled } from "./release-flags";

describe("isReleaseCatAllFilesEnabled", () => {
  it("passes providerKind into flag.run identify entities", async () => {
    releaseCatAllFilesFlagRunMock.mockResolvedValue(true);

    await expect(isReleaseCatAllFilesEnabled("crowdin")).resolves.toBe(true);

    expect(releaseCatAllFilesFlagRunMock).toHaveBeenCalledWith({
      identify: { providerKind: "crowdin" },
    });
  });

  it("normalizes omitted providerKind to null for native projects", async () => {
    releaseCatAllFilesFlagRunMock.mockResolvedValue(true);

    await expect(isReleaseCatAllFilesEnabled()).resolves.toBe(true);

    expect(releaseCatAllFilesFlagRunMock).toHaveBeenCalledWith({
      identify: { providerKind: null },
    });
  });

  it("returns false when flag evaluation throws", async () => {
    releaseCatAllFilesFlagRunMock.mockRejectedValue(new Error("flags unavailable"));

    await expect(isReleaseCatAllFilesEnabled("crowdin")).resolves.toBe(false);
  });
});
