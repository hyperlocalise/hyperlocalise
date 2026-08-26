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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  readIssueDetailSidebarOpen,
  subscribeIssueDetailSidebarState,
  writeIssueDetailSidebarOpen,
} from "./issue-detail-sidebar-state";

function createStorageMock() {
  const storage = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    storage,
  };
}

describe("issue-detail-sidebar-state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the fallback when no value is stored for an issue", () => {
    const { getItem, setItem } = createStorageMock();
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem },
    });

    expect(readIssueDetailSidebarOpen("issue-detail", "issue_1", true)).toBe(true);
    expect(readIssueDetailSidebarOpen("inbox", "issue_2", false)).toBe(false);
  });

  it("reads and writes persisted sidebar state per scope and issue", () => {
    const { getItem, setItem, storage } = createStorageMock();
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem },
    });

    writeIssueDetailSidebarOpen("issue-detail", "issue_1", false);
    writeIssueDetailSidebarOpen("issue-detail", "issue_2", true);
    writeIssueDetailSidebarOpen("inbox", "issue_1", true);

    expect(readIssueDetailSidebarOpen("issue-detail", "issue_1", true)).toBe(false);
    expect(readIssueDetailSidebarOpen("issue-detail", "issue_2", false)).toBe(true);
    expect(readIssueDetailSidebarOpen("inbox", "issue_1", false)).toBe(true);
    expect(readIssueDetailSidebarOpen("inbox", "issue_2", false)).toBe(false);
    expect(storage.get("issue-detail-sidebar-open:v2")).toBe(
      JSON.stringify({ issue_1: false, issue_2: true }),
    );
    expect(storage.get("inbox-issue-sidebar-open:v2")).toBe(JSON.stringify({ issue_1: true }));
  });

  it("ignores invalid stored values", () => {
    const getItem = vi.fn().mockReturnValue("maybe");
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem: vi.fn() },
    });

    expect(readIssueDetailSidebarOpen("issue-detail", "issue_1", true)).toBe(true);
  });

  it("notifies subscribers when sidebar state is written", () => {
    const { getItem, setItem } = createStorageMock();
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const listener = vi.fn();
    const unsubscribe = subscribeIssueDetailSidebarState(listener);

    writeIssueDetailSidebarOpen("issue-detail", "issue_1", false);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("returns fallbacks and skips writes when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", {});

    expect(readIssueDetailSidebarOpen("issue-detail", "issue_1", true)).toBe(true);
    expect(() => writeIssueDetailSidebarOpen("issue-detail", "issue_1", false)).not.toThrow();
    expect(readIssueDetailSidebarOpen("issue-detail", "issue_1", true)).toBe(true);
  });
});
