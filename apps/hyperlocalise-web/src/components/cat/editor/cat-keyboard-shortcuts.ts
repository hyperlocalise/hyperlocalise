/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
