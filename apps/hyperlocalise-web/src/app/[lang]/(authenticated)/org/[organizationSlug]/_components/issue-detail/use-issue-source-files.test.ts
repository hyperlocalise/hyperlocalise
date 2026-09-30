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

import { collectIssueSourceFilePages } from "./use-issue-source-files";

describe("collectIssueSourceFilePages", () => {
  it("stops when a page is shorter than the page size", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce([
        { sourcePath: "a.json" },
        { sourcePath: "b.json" },
        { sourcePath: "c.json" },
      ])
      .mockResolvedValueOnce([{ sourcePath: "d.json" }]);

    await expect(collectIssueSourceFilePages(fetchPage, 3, 5)).resolves.toEqual([
      { sourcePath: "a.json" },
      { sourcePath: "b.json" },
      { sourcePath: "c.json" },
      { sourcePath: "d.json" },
    ]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 3);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 3, 3);
  });

  it("caps the number of pages", async () => {
    const fetchPage = vi.fn(async (offset: number) => [
      { sourcePath: `file-${offset}.json` },
      { sourcePath: `file-${offset + 1}.json` },
    ]);

    const files = await collectIssueSourceFilePages(fetchPage, 2, 3);
    expect(files).toHaveLength(6);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});
