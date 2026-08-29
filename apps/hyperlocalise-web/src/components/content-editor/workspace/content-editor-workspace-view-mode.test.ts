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
  CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY,
  contentEditorPageLimitForViewMode,
  isCatWorkspaceViewMode,
  readCatWorkspaceViewMode,
  writeCatWorkspaceViewMode,
} from "./content-editor-workspace-view-mode";

describe("content-editor-workspace-view-mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to comfortable when storage is empty", () => {
    const getItem = vi.fn().mockReturnValue(null);
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem: vi.fn() },
    });

    expect(readCatWorkspaceViewMode()).toBe("comfortable");
  });

  it("reads stored view mode", () => {
    const getItem = vi.fn().mockReturnValue("side-by-side");
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem: vi.fn() },
    });

    expect(readCatWorkspaceViewMode()).toBe("side-by-side");
  });

  it("reads stored file view mode", () => {
    const getItem = vi.fn().mockReturnValue("file");
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem: vi.fn() },
    });

    expect(readCatWorkspaceViewMode()).toBe("file");
  });

  it("writes view mode to storage", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { getItem: vi.fn(), setItem },
    });

    writeCatWorkspaceViewMode("side-by-side");

    expect(setItem).toHaveBeenCalledWith(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY, "side-by-side");
  });

  it("defaults to comfortable and skips writes when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", {});

    expect(readCatWorkspaceViewMode()).toBe("comfortable");
    expect(() => writeCatWorkspaceViewMode("file")).not.toThrow();
    expect(readCatWorkspaceViewMode()).toBe("comfortable");
  });

  it("maps view mode to page limits", () => {
    expect(contentEditorPageLimitForViewMode("comfortable")).toBe(50);
    expect(contentEditorPageLimitForViewMode("side-by-side")).toBe(20);
    // File view keeps Comfortable page size so aggregate queue selections survive.
    expect(contentEditorPageLimitForViewMode("file")).toBe(50);
  });

  it("recognizes valid view modes", () => {
    expect(isCatWorkspaceViewMode("file")).toBe(true);
    expect(isCatWorkspaceViewMode("grid")).toBe(false);
  });
});
