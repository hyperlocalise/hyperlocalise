"use client";

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
import { defineMessages } from "react-intl";

export const catVisualEditorMessages = defineMessages({
  filesTitle: {
    defaultMessage: "Files",
    id: "o+9WBKhrWc",
    description: "Visual editor left sidebar title for the project file tree",
  },
  progressTitle: {
    defaultMessage: "Translation progress",
    id: "6k5g5rQjwO",
    description: "Visual editor left sidebar progress section title",
  },
  translatedCount: {
    defaultMessage: "Translated",
    id: "hU16et2xGh",
    description: "Label for translated string count in visual editor progress",
  },
  inReviewCount: {
    defaultMessage: "In review",
    id: "BUGP6fk/PM",
    description: "Label for in-review string count in visual editor progress",
  },
  untranslatedCount: {
    defaultMessage: "Untranslated",
    id: "yllmXGQJt9",
    description: "Label for untranslated string count in visual editor progress",
  },
  deviceDesktop: {
    defaultMessage: "Desktop preview",
    id: "EH16+mA9TP",
    description: "Aria label for desktop device toggle in visual editor canvas",
  },
  deviceTablet: {
    defaultMessage: "Tablet preview",
    id: "mF/FxMOcA8",
    description: "Aria label for tablet device toggle in visual editor canvas",
  },
  deviceMobile: {
    defaultMessage: "Mobile preview",
    id: "xaRX3MQcXd",
    description: "Aria label for mobile device toggle in visual editor canvas",
  },
  refreshPreview: {
    defaultMessage: "Refresh preview",
    id: "mRdtQn8m2l",
    description: "Aria label for refresh button on the visual editor preview URL bar",
  },
  highlightToggle: {
    defaultMessage: "Highlight translatable",
    id: "c7/0cqs4Ou",
    description: "Label for toggle that highlights translatable nodes in the preview",
  },
  editingStatus: {
    defaultMessage: "Editing · {file} · {locale}",
    id: "Ve2Cw+kZK7",
    description: "Status text in the visual editor canvas toolbar",
  },
  previewAria: {
    defaultMessage: "Website preview canvas",
    id: "5H2Xr7AzgM",
    description: "Aria label for the visual editor live preview region",
  },
  inlineConfirm: {
    defaultMessage: "Confirm translation",
    id: "y67tURYFUp",
    description: "Aria label for confirm button on the visual editor inline edit popup",
  },
  inlineAi: {
    defaultMessage: "Apply AI suggestion",
    id: "KyJwSVZhHh",
    description: "Aria label for AI suggestion button on the visual editor inline edit popup",
  },
  characterCount: {
    defaultMessage: "{current} / {max}",
    id: "ERN+VZrV7G",
    description: "Character count for the visual editor inline translation field",
  },
  textNodeHeading: {
    defaultMessage: "Text node {tag}",
    id: "I36gOxvz/d",
    description: "Right panel heading for the selected text node in the visual editor",
  },
  statusBarProgress: {
    defaultMessage: "{done} / {total} strings",
    id: "1t1U3y5/ZB",
    description: "Bottom status bar string progress in the visual editor",
  },
  statusBarSelected: {
    defaultMessage: "{count} selected",
    id: "C/eqU8t/O1",
    description: "Bottom status bar selected node count in the visual editor",
  },
  navigateHint: {
    defaultMessage: "Navigate",
    id: "XLq9iP13g1",
    description: "Keyboard shortcut hint for navigating nodes in the visual editor",
  },
  deselectHint: {
    defaultMessage: "Deselect",
    id: "oHxxsDmsrY",
    description: "Keyboard shortcut hint for deselecting a node in the visual editor",
  },
  shortcutsHint: {
    defaultMessage: "Shortcuts",
    id: "AvA8AXeJqN",
    description: "Label linking to keyboard shortcuts help in the visual editor status bar",
  },
  emptySelection: {
    defaultMessage: "Select a highlighted string in the preview to edit it.",
    id: "MGGYx8BG6F",
    description: "Empty state when no preview node is selected in the visual editor",
  },
  footerCopyright: {
    defaultMessage: "© {year} Hyperlocalise",
    id: "uirqgKf7xz",
    description: "Copyright line in the visual editor status bar",
  },
});
