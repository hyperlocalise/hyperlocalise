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

import { loadGoogleDriveBrowsePages } from "./browse-pages";

describe("loadGoogleDriveBrowsePages", () => {
  it("follows nextPageToken until the listing is complete", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: "a" }],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        items: [{ id: "b" }],
        nextPageToken: null,
      });

    await expect(loadGoogleDriveBrowsePages({ fetchPage })).resolves.toEqual([
      { id: "a" },
      { id: "b" },
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "page-2");
  });

  it("stops at the configured file limit", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [{ id: "a" }, { id: "b" }, { id: "c" }],
      nextPageToken: "page-2",
    });

    await expect(loadGoogleDriveBrowsePages({ fetchPage, maxItems: 2 })).resolves.toEqual([
      { id: "a" },
      { id: "b" },
    ]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
