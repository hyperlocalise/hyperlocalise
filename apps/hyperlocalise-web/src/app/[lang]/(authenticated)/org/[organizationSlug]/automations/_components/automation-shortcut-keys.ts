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
import { getModKeyLabel } from "@/components/content-editor/editor/content-editor-keyboard-shortcuts";

export type AutomationShortcutId =
  | "save"
  | "primary"
  | "assistant"
  | "undo"
  | "redo"
  | "addNode"
  | "fitView"
  | "shortcuts";

export type AutomationShortcutSurface = "automation" | "visual_workflow";

/** Marks the shortcuts list so `?` can close it while other dialogs stay untouched. */
export const AUTOMATION_SHORTCUTS_DIALOG_ATTR = "data-automation-shortcuts-dialog";

const AUTOMATION_SHORTCUTS: readonly AutomationShortcutId[] = [
  "save",
  "primary",
  "assistant",
  "undo",
  "redo",
  "shortcuts",
];

const VISUAL_WORKFLOW_SHORTCUTS: readonly AutomationShortcutId[] = [
  "save",
  "primary",
  "assistant",
  "undo",
  "redo",
  "addNode",
  "fitView",
  "shortcuts",
];

/** The shortcuts listed for a surface, in the order the dialog shows them. */
export function listAutomationShortcuts(
  surface: AutomationShortcutSurface,
  { assistant = false }: { assistant?: boolean } = {},
): readonly AutomationShortcutId[] {
  const rows = surface === "visual_workflow" ? VISUAL_WORKFLOW_SHORTCUTS : AUTOMATION_SHORTCUTS;
  return assistant ? rows : rows.filter((id) => id !== "assistant");
}

export function getRevealKeyLabel(isMac: boolean): string {
  return isMac ? "⌥" : "Alt";
}

export function getAutomationShortcutKeys(
  isMac: boolean,
  shortcut: AutomationShortcutId,
): string[] {
  const mod = getModKeyLabel(isMac);

  switch (shortcut) {
    case "save":
      return [mod, "S"];
    case "primary":
      return [mod, isMac ? "↵" : "Enter"];
    case "assistant":
      return [mod, "/"];
    case "undo":
      return [mod, "Z"];
    case "redo":
      return isMac ? [mod, "⇧", "Z"] : [mod, "Shift", "Z"];
    case "addNode":
      return ["N"];
    case "fitView":
      return ["F"];
    case "shortcuts":
      return ["?"];
  }
}

export function getAutomationShortcutText(isMac: boolean, shortcut: AutomationShortcutId): string {
  const keys = getAutomationShortcutKeys(isMac, shortcut);
  return isMac ? keys.join("") : keys.join("+");
}

/** Fields and other editors keep unmodified keys; modifier chords still run. */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** A dialog or sheet already has the keyboard; page shortcuts wait. */
export function hasOpenShortcutModal(root: ParentNode = document): boolean {
  return root.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/** True when a modal other than the shortcuts list is open. `?` can still close that list. */
export function hasForeignShortcutModal(root: ParentNode = document): boolean {
  for (const modal of root.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (
      !(modal instanceof HTMLElement) ||
      !modal.closest(`[${AUTOMATION_SHORTCUTS_DIALOG_ATTR}]`)
    ) {
      return true;
    }
  }
  return false;
}
