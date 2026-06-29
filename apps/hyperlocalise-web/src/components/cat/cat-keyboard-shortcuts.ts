export type CatEditorShortcut = "approve" | "findContext" | "previous" | "next";

export function getModKeyLabel(isMac: boolean): string {
  return isMac ? "⌘" : "Ctrl";
}

export function getCatShortcutKeys(isMac: boolean, shortcut: CatEditorShortcut): string[] {
  const mod = getModKeyLabel(isMac);

  switch (shortcut) {
    case "approve":
      return [mod, isMac ? "↵" : "Enter"];
    case "findContext":
      return [mod, "K"];
    case "previous":
      return [mod, "←"];
    case "next":
      return [mod, "→"];
  }
}

export function getCatShortcutLabel(isMac: boolean, shortcut: CatEditorShortcut): string {
  const keys = getCatShortcutKeys(isMac, shortcut);
  return isMac ? keys.join("") : keys.join("+");
}
