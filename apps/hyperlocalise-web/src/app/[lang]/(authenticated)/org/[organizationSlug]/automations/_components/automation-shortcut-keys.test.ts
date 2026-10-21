// @vitest-environment happy-dom

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
  getAutomationShortcutKeys,
  getAutomationShortcutText,
  getRevealKeyLabel,
  hasOpenShortcutModal,
  isEditableShortcutTarget,
  listAutomationShortcuts,
} from "./automation-shortcut-keys";

describe("automation shortcut keys", () => {
  it("lists canvas-only shortcuts on the visual workflow surface", () => {
    expect(listAutomationShortcuts("automation")).not.toContain("addNode");
    expect(listAutomationShortcuts("visual_workflow")).toEqual(
      expect.arrayContaining(["addNode", "fitView", "primary"]),
    );
  });

  it("names the modifier for the current platform", () => {
    expect(getRevealKeyLabel(true)).toBe("⌥");
    expect(getRevealKeyLabel(false)).toBe("Alt");
    expect(getAutomationShortcutKeys(true, "save")).toEqual(["⌘", "S"]);
    expect(getAutomationShortcutKeys(false, "save")).toEqual(["Ctrl", "S"]);
    expect(getAutomationShortcutText(true, "undo")).toBe("⌘Z");
    expect(getAutomationShortcutText(false, "undo")).toBe("Ctrl+Z");
  });

  it("treats fields as editable targets and dialogs as open modals", () => {
    const input = document.createElement("input");
    const box = document.createElement("div");
    box.setAttribute("role", "dialog");
    document.body.append(input, box);

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(document.body)).toBe(false);
    expect(hasOpenShortcutModal()).toBe(true);

    box.remove();
    input.remove();
    expect(hasOpenShortcutModal()).toBe(false);
  });
});
