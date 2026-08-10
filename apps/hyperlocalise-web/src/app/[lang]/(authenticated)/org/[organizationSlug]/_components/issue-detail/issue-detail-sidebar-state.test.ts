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

import {
  readIssueDetailSidebarOpen,
  writeIssueDetailSidebarOpen,
} from "./issue-detail-sidebar-state";

describe("issue-detail-sidebar-state", () => {
  it("returns the fallback when no value is stored", () => {
    const getItem = vi.fn().mockReturnValue(null);
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem: vi.fn() },
    });

    expect(readIssueDetailSidebarOpen("issue-detail", true)).toBe(true);
    expect(readIssueDetailSidebarOpen("inbox", false)).toBe(false);
  });

  it("reads and writes persisted sidebar state per scope", () => {
    const storage = new Map<string, string>();
    const getItem = vi.fn((key: string) => storage.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) => {
      storage.set(key, value);
    });
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem },
    });

    writeIssueDetailSidebarOpen("issue-detail", false);
    writeIssueDetailSidebarOpen("inbox", true);

    expect(readIssueDetailSidebarOpen("issue-detail", true)).toBe(false);
    expect(readIssueDetailSidebarOpen("inbox", false)).toBe(true);
    expect(setItem).toHaveBeenCalledWith("issue-detail-sidebar-open:v1", "false");
    expect(setItem).toHaveBeenCalledWith("inbox-issue-sidebar-open:v1", "true");
  });

  it("ignores invalid stored values", () => {
    const getItem = vi.fn().mockReturnValue("maybe");
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem: vi.fn() },
    });

    expect(readIssueDetailSidebarOpen("issue-detail", true)).toBe(true);
  });
});
