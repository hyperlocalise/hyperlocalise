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
import { describe, expect, it } from "vite-plus/test";

import {
  CONTENT_EDITOR_SHORTCUT_GROUPS,
  getCatShortcutAriaKeys,
  getCatShortcutDialogRows,
  getCatShortcutKeys,
  getCatShortcutLabel,
  getModKeyLabel,
} from "./content-editor-keyboard-shortcuts";

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

  it("formats aria-keyshortcuts values per platform", () => {
    expect(getCatShortcutAriaKeys(true, "toggleDetailsPanel")).toBe("Meta+Alt+B");
    expect(getCatShortcutAriaKeys(false, "clearTarget")).toBe("Control+Shift+Backspace");
  });

  it("collapses translation memory shortcuts into one dialog row", () => {
    const rows = getCatShortcutDialogRows(true, "editing");
    const ids = rows.map((row) => row.id);

    expect(ids).toContain("useSuggestion1");
    expect(ids).not.toContain("useSuggestion2");
    expect(ids).not.toContain("useSuggestion3");
    expect(rows.find((row) => row.id === "useSuggestion1")?.keys).toEqual(["⌥", "1–3"]);
  });

  it("lists every shortcut in exactly one dialog group", () => {
    const ids = CONTENT_EDITOR_SHORTCUT_GROUPS.flatMap((group) =>
      getCatShortcutDialogRows(false, group).map((row) => row.id),
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["saveDraft", "searchStrings", "openShortcuts"]));
    const openShortcuts = getCatShortcutDialogRows(false, "workspace").find(
      (row) => row.id === "openShortcuts",
    );
    expect(openShortcuts?.alternateKeys).toEqual(["?"]);
  });
});
