import { describe, expect, it } from "vite-plus/test";

import { getCatShortcutKeys, getCatShortcutLabel, getModKeyLabel } from "./cat-keyboard-shortcuts";

describe("cat keyboard shortcuts", () => {
  it("uses command key labels on macOS", () => {
    expect(getModKeyLabel(true)).toBe("⌘");
    expect(getCatShortcutKeys(true, "findContext")).toEqual(["⌘", "K"]);
    expect(getCatShortcutLabel(true, "previous")).toBe("⌘←");
  });

  it("uses control key labels on Windows", () => {
    expect(getModKeyLabel(false)).toBe("Ctrl");
    expect(getCatShortcutKeys(false, "findContext")).toEqual(["Ctrl", "K"]);
    expect(getCatShortcutLabel(false, "previous")).toBe("Ctrl+←");
  });
});
