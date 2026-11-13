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
import type { MessageDescriptor } from "react-intl";

import { contentEditorShortcutsDialogMessages as messages } from "@/components/content-editor/shared/content-editor-chrome.messages";

type ShortcutKeyToken =
  | "mod"
  | "shift"
  | "alt"
  | "enter"
  | "backspace"
  | "left"
  | "right"
  | "up"
  | "down"
  | "esc"
  | (string & {});

export type ContentEditorShortcutGroup = "editing" | "navigation" | "workspace";

type ContentEditorShortcutDefinition = {
  /** `react-hotkeys-hook` binding. Letters and digits match the physical key. */
  hotkey: string;
  keys: readonly ShortcutKeyToken[];
  label: MessageDescriptor;
  group: ContentEditorShortcutGroup;
  /** Keys shown in the dialog when one row stands for several bindings. */
  dialogKeys?: readonly ShortcutKeyToken[];
  /** Another binding for the same action, registered outside this registry. */
  alternateKeys?: readonly ShortcutKeyToken[];
  /** Covered by another row in the shortcuts dialog. */
  hiddenFromDialog?: boolean;
};

export const CONTENT_EDITOR_SHORTCUTS = {
  approve: {
    hotkey: "mod+enter",
    keys: ["mod", "enter"],
    label: messages.approve,
    group: "editing",
  },
  saveDraft: {
    hotkey: "mod+s",
    keys: ["mod", "S"],
    label: messages.saveDraft,
    group: "editing",
  },
  copySource: {
    hotkey: "mod+shift+v",
    keys: ["mod", "shift", "V"],
    label: messages.copySource,
    group: "editing",
  },
  clearTarget: {
    hotkey: "mod+shift+backspace",
    keys: ["mod", "shift", "backspace"],
    label: messages.clearTarget,
    group: "editing",
  },
  useSuggestion1: {
    hotkey: "alt+1",
    keys: ["alt", "1"],
    label: messages.useSuggestion,
    group: "editing",
    dialogKeys: ["alt", "1–3"],
  },
  useSuggestion2: {
    hotkey: "alt+2",
    keys: ["alt", "2"],
    label: messages.useSuggestion,
    group: "editing",
    hiddenFromDialog: true,
  },
  useSuggestion3: {
    hotkey: "alt+3",
    keys: ["alt", "3"],
    label: messages.useSuggestion,
    group: "editing",
    hiddenFromDialog: true,
  },
  findContext: {
    hotkey: "mod+k",
    keys: ["mod", "K"],
    label: messages.findContext,
    group: "editing",
  },
  addComment: {
    hotkey: "mod+shift+m",
    keys: ["mod", "shift", "M"],
    label: messages.addComment,
    group: "editing",
  },
  previous: {
    hotkey: "mod+arrowleft, mod+arrowup",
    keys: ["mod", "left"],
    label: messages.previous,
    group: "navigation",
  },
  next: {
    hotkey: "mod+arrowright, mod+arrowdown",
    keys: ["mod", "right"],
    label: messages.next,
    group: "navigation",
  },
  previousUntranslated: {
    hotkey: "mod+shift+arrowup",
    keys: ["mod", "shift", "up"],
    label: messages.previousUntranslated,
    group: "navigation",
  },
  nextUntranslated: {
    hotkey: "mod+shift+arrowdown",
    keys: ["mod", "shift", "down"],
    label: messages.nextUntranslated,
    group: "navigation",
  },
  exitSelection: {
    hotkey: "escape",
    keys: ["esc"],
    label: messages.exitSelection,
    group: "navigation",
  },
  searchStrings: {
    hotkey: "slash",
    keys: ["/"],
    label: messages.searchStrings,
    group: "workspace",
  },
  toggleFilesPanel: {
    hotkey: "mod+b",
    keys: ["mod", "B"],
    label: messages.toggleFilesPanel,
    group: "workspace",
  },
  toggleDetailsPanel: {
    hotkey: "mod+alt+b",
    keys: ["mod", "alt", "B"],
    label: messages.toggleDetailsPanel,
    group: "workspace",
  },
  openShortcuts: {
    hotkey: "mod+slash",
    keys: ["mod", "/"],
    alternateKeys: ["?"],
    label: messages.openShortcuts,
    group: "workspace",
  },
} as const satisfies Record<string, ContentEditorShortcutDefinition>;

export type ContentEditorShortcutId = keyof typeof CONTENT_EDITOR_SHORTCUTS;

export const CONTENT_EDITOR_SHORTCUT_GROUPS: readonly ContentEditorShortcutGroup[] = [
  "editing",
  "navigation",
  "workspace",
];

const MAC_KEY_LABELS: Record<string, string> = {
  mod: "⌘",
  shift: "⇧",
  alt: "⌥",
  enter: "↵",
  backspace: "⌫",
  esc: "Esc",
};

const OTHER_KEY_LABELS: Record<string, string> = {
  mod: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  enter: "Enter",
  backspace: "Backspace",
  esc: "Esc",
};

const ARROW_KEY_LABELS: Record<string, string> = {
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
};

export function getModKeyLabel(isMac: boolean): string {
  return isMac ? MAC_KEY_LABELS.mod : OTHER_KEY_LABELS.mod;
}

function formatShortcutKeys(isMac: boolean, keys: readonly ShortcutKeyToken[]): string[] {
  const labels = isMac ? MAC_KEY_LABELS : OTHER_KEY_LABELS;
  return keys.map((key) => labels[key] ?? ARROW_KEY_LABELS[key] ?? key);
}

export function getCatShortcutKeys(isMac: boolean, shortcut: ContentEditorShortcutId): string[] {
  return formatShortcutKeys(isMac, CONTENT_EDITOR_SHORTCUTS[shortcut].keys);
}

export function getCatShortcutLabel(isMac: boolean, shortcut: ContentEditorShortcutId): string {
  const keys = getCatShortcutKeys(isMac, shortcut);
  return isMac ? keys.join("") : keys.join("+");
}

const ARIA_KEY_NAMES: Record<string, string> = {
  shift: "Shift",
  alt: "Alt",
  enter: "Enter",
  backspace: "Backspace",
  esc: "Escape",
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
};

/** Value for `aria-keyshortcuts`. */
export function getCatShortcutAriaKeys(isMac: boolean, shortcut: ContentEditorShortcutId): string {
  return CONTENT_EDITOR_SHORTCUTS[shortcut].keys
    .map((key) => (key === "mod" ? (isMac ? "Meta" : "Control") : (ARIA_KEY_NAMES[key] ?? key)))
    .join("+");
}

export function getCatShortcutHotkey(shortcut: ContentEditorShortcutId): string {
  return CONTENT_EDITOR_SHORTCUTS[shortcut].hotkey;
}

export type ContentEditorShortcutDialogRow = {
  id: ContentEditorShortcutId;
  label: MessageDescriptor;
  keys: string[];
  alternateKeys?: string[];
};

export function getCatShortcutDialogRows(
  isMac: boolean,
  group: ContentEditorShortcutGroup,
): ContentEditorShortcutDialogRow[] {
  return (Object.keys(CONTENT_EDITOR_SHORTCUTS) as ContentEditorShortcutId[]).flatMap((id) => {
    const definition: ContentEditorShortcutDefinition = CONTENT_EDITOR_SHORTCUTS[id];
    if (definition.group !== group || definition.hiddenFromDialog) {
      return [];
    }

    return [
      {
        id,
        label: definition.label,
        keys: formatShortcutKeys(isMac, definition.dialogKeys ?? definition.keys),
        alternateKeys: definition.alternateKeys
          ? formatShortcutKeys(isMac, definition.alternateKeys)
          : undefined,
      },
    ];
  });
}
