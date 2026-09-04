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
  readCatFileViewSourcePaneVisible,
  writeCatFileViewSourcePaneVisible,
} from "./content-editor-file-view-source-pane";

describe("content-editor-file-view-source-pane", () => {
  it("defaults to visible and persists hidden state", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem,
    });

    expect(readCatFileViewSourcePaneVisible()).toBe(true);

    writeCatFileViewSourcePaneVisible(false);
    expect(setItem).toHaveBeenCalledWith("content-editor-file-view:source-pane:v1", "false");

    vi.stubGlobal("localStorage", undefined);
  });
});
