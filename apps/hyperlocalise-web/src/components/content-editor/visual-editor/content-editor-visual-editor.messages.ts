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

export const contentEditorVisualEditorMessages = defineMessages({
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
  previewAria: {
    defaultMessage: "Website preview canvas",
    id: "5H2Xr7AzgM",
    description: "Aria label for the visual editor live preview region",
  },
  selectedStringHeading: {
    defaultMessage: "Selected string",
    id: "vhTlP0jReG",
    description: "Fallback right-panel heading when a visual editor string has no context label",
  },
  stringPosition: {
    defaultMessage: "{position} / {total}",
    id: "pbA55RTgks",
    description: "Current string index and total count in the visual editor detail panel",
  },
  remainingCount: {
    defaultMessage: "{count} left",
    id: "rZuJRFmTxw",
    description: "Count of strings still needing translation or review in the visual editor",
  },
  statusBarProgress: {
    defaultMessage: "{done} / {total} approved",
    id: "8juGL005+Y",
    description: "Bottom status bar approved string progress in the visual editor",
  },
  statusBarRemaining: {
    defaultMessage: "{count} need attention",
    id: "FF6P5p7LKO",
    description: "Bottom status bar count of pending or in-review strings in the visual editor",
  },
  navigateHint: {
    defaultMessage: "Next string",
    id: "uVBHlI1Rb6",
    description: "Keyboard shortcut hint for navigating strings in the visual editor",
  },
  nextOpenHint: {
    defaultMessage: "Next open",
    id: "oc3EaT6uAq",
    description: "Keyboard shortcut hint for jumping to the next unfinished string",
  },
  deselectHint: {
    defaultMessage: "Deselect",
    id: "oHxxsDmsrY",
    description: "Keyboard shortcut hint for deselecting a node in the visual editor",
  },
  emptySelection: {
    defaultMessage: "Click a string in the preview to edit it here.",
    id: "7yLnsi62KD",
    description: "Empty state when no preview node is selected in the visual editor",
  },
  previewEmptyFile: {
    defaultMessage: "No previewable strings in this file yet.",
    id: "0G0Gi8OsmJ",
    description: "Empty state when the selected visual editor file has no preview strings",
  },
  footerCopyright: {
    defaultMessage: "© {year} Hyperlocalise",
    id: "uirqgKf7xz",
    description: "Copyright line in the visual editor status bar",
  },
});
