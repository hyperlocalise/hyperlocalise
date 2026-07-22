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
import { describe, expect, it } from "vite-plus/test";

import { getCatShortcutKeys, getCatShortcutLabel, getModKeyLabel } from "./cat-keyboard-shortcuts";

describe("cat keyboard shortcuts", () => {
  it("uses command key labels on macOS", () => {
    expect(getModKeyLabel(true)).toBe("⌘");
    expect(getCatShortcutKeys(true, "approve")).toEqual(["⌘", "↵"]);
    expect(getCatShortcutKeys(true, "findContext")).toEqual(["⌘", "K"]);
    expect(getCatShortcutKeys(true, "previous")).toEqual(["⌘", "←"]);
    expect(getCatShortcutKeys(true, "next")).toEqual(["⌘", "→"]);
    expect(getCatShortcutLabel(true, "approve")).toBe("⌘↵");
    expect(getCatShortcutLabel(true, "previous")).toBe("⌘←");
    expect(getCatShortcutLabel(true, "next")).toBe("⌘→");
  });

  it("uses control key labels on Windows", () => {
    expect(getModKeyLabel(false)).toBe("Ctrl");
    expect(getCatShortcutKeys(false, "approve")).toEqual(["Ctrl", "Enter"]);
    expect(getCatShortcutKeys(false, "findContext")).toEqual(["Ctrl", "K"]);
    expect(getCatShortcutKeys(false, "previous")).toEqual(["Ctrl", "←"]);
    expect(getCatShortcutKeys(false, "next")).toEqual(["Ctrl", "→"]);
    expect(getCatShortcutLabel(false, "approve")).toBe("Ctrl+Enter");
    expect(getCatShortcutLabel(false, "previous")).toBe("Ctrl+←");
    expect(getCatShortcutLabel(false, "next")).toBe("Ctrl+→");
  });
});
