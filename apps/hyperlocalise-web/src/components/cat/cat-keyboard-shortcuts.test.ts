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
