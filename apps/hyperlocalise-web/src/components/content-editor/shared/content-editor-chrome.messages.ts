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

export const contentEditorViewMenuMessages = defineMessages({
  trigger: {
    defaultMessage: "View",
    id: "zav6I2MtpJ",
    description: "Label for the Content Editor view options menu trigger",
  },
  triggerAria: {
    defaultMessage: "View options",
    id: "Ps7pQymjZB",
    description: "Accessible label for the Content Editor view options menu trigger",
  },
  layoutLabel: {
    defaultMessage: "Layout",
    id: "HpSZVN9p7L",
    description: "Section label for workspace layout options in the Content Editor view menu",
  },
  modeLabel: {
    defaultMessage: "Mode",
    id: "NiBNvdtgqF",
    description: "Section label for workspace persona options in the Content Editor view menu",
  },
  sortLabel: {
    defaultMessage: "Sort strings",
    id: "3B3n54tU18",
    description: "Section label for queue sort options in the Content Editor view menu",
  },
  groupingLabel: {
    defaultMessage: "Show strings",
    id: "ru7Wge58fC",
    description: "Section label for grouped or individual string options in the view menu",
  },
  panelsLabel: {
    defaultMessage: "Panels",
    id: "0W8f7Hq7eM",
    description: "Section label for panel visibility toggles in the Content Editor view menu",
  },
  filesPanel: {
    defaultMessage: "Files panel",
    id: "FZ/OkTcJpl",
    description: "View menu toggle that shows or hides the files panel",
  },
  detailsPanel: {
    defaultMessage: "Details panel",
    id: "qbyieDePtF",
    description: "View menu toggle that shows or hides the string details panel",
  },
});

export const contentEditorOverflowMenuMessages = defineMessages({
  triggerAria: {
    defaultMessage: "More actions",
    id: "x2Cfa/aUUM",
    description: "Accessible label for the Content Editor overflow actions menu",
  },
  downloadFilteredView: {
    defaultMessage: "Download filtered view…",
    id: "cx3+OxbAb3",
    description: "Overflow menu item that opens the filtered export dialog",
  },
  fileActivity: {
    defaultMessage: "File activity",
    id: "c2QYSQJf6k",
    description: "Overflow menu item that opens the file activity log",
  },
  keyboardShortcuts: {
    defaultMessage: "Keyboard shortcuts",
    id: "FhEjxRttwc",
    description: "Overflow menu item that opens the keyboard shortcuts dialog",
  },
});

export const contentEditorBulkBarMessages = defineMessages({
  select: {
    defaultMessage: "Select",
    id: "AXEaiv3hw7",
    description: "Button that turns on bulk selection in the Content Editor queue",
  },
  selectedCount: {
    defaultMessage: "{count, plural, one {# selected} other {# selected}}",
    id: "nSV3pblCAm",
    description: "Number of strings selected in the Content Editor bulk action bar",
  },
  selectAllVisible: {
    defaultMessage: "Select all visible ({count})",
    id: "I8eNE+aJdj",
    description: "Bulk action bar button that selects every loaded string",
  },
  more: {
    defaultMessage: "More",
    id: "PyrXpZW3dU",
    description: "Bulk action bar menu with less common bulk actions",
  },
  done: {
    defaultMessage: "Done",
    id: "iE2A3xoRIH",
    description: "Bulk action bar button that exits selection mode",
  },
  barAria: {
    defaultMessage: "Bulk actions",
    id: "jZp99wvTSu",
    description: "Accessible label for the Content Editor bulk action bar",
  },
});

export const contentEditorExportDialogMessages = defineMessages({
  title: {
    defaultMessage: "Download filtered view",
    id: "YNEVk3jydD",
    description: "Title of the Content Editor filtered export dialog",
  },
  description: {
    defaultMessage: "Exports the strings that match the current filter: {filter}.",
    id: "6InUvYkWGX",
    description: "Description of the Content Editor filtered export dialog",
  },
  formatLabel: {
    defaultMessage: "File format",
    id: "CIDv8dNyhc",
    description: "Label for the export format choices in the filtered export dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Mt2FErfqOi",
    description: "Closes the filtered export dialog without downloading",
  },
  download: {
    defaultMessage: "Download",
    id: "RcXQkSHSjo",
    description: "Starts the filtered export download",
  },
});

export const contentEditorShortcutsDialogMessages = defineMessages({
  title: {
    defaultMessage: "Keyboard shortcuts",
    id: "fmHJLMYbQV",
    description: "Title of the Content Editor keyboard shortcuts dialog",
  },
  description: {
    defaultMessage: "Shortcuts work while you edit a string.",
    id: "ZJeMLihOyK",
    description: "Description of the Content Editor keyboard shortcuts dialog",
  },
  approve: {
    defaultMessage: "Approve string",
    id: "qAQXdmfmq+",
    description: "Keyboard shortcuts dialog row for approving the current string",
  },
  previous: {
    defaultMessage: "Previous string",
    id: "AtXAhlt1Vc",
    description: "Keyboard shortcuts dialog row for moving to the previous string",
  },
  next: {
    defaultMessage: "Next string",
    id: "CxBkPTcIQP",
    description: "Keyboard shortcuts dialog row for moving to the next string",
  },
  findContext: {
    defaultMessage: "Find context",
    id: "d3L1baYy7c",
    description: "Keyboard shortcuts dialog row for looking up repository context",
  },
  openShortcuts: {
    defaultMessage: "Show keyboard shortcuts",
    id: "/TFjPTBnks",
    description: "Keyboard shortcuts dialog row for opening this dialog",
  },
  exitSelection: {
    defaultMessage: "Exit bulk selection",
    id: "+XceZn1/ER",
    description: "Keyboard shortcuts dialog row for leaving bulk selection mode",
  },
  showHintBar: {
    defaultMessage: "Show shortcut hints below the editor",
    id: "wSzothE8ek",
    description: "Toggle in the shortcuts dialog for the editor shortcut hint strip",
  },
});

export const contentEditorSegmentActionsMessages = defineMessages({
  triggerAria: {
    defaultMessage: "String actions",
    id: "RbEKTU1lMo",
    description: "Accessible label for the per-string actions menu",
  },
  copyLink: {
    defaultMessage: "Copy link to this string",
    id: "jWhUR5x+Vb",
    description: "Per-string menu item that copies a link to the string",
  },
  linkCopied: {
    defaultMessage: "Link copied",
    id: "MmXiAtBLYT",
    description: "Toast after copying a link to a string",
  },
  linkCopyFailed: {
    defaultMessage: "Could not copy link",
    id: "99GL6BjW2r",
    description: "Toast when copying a link to a string fails",
  },
  lock: {
    defaultMessage: "Lock string",
    id: "DREQo1UjtT",
    description: "Per-string menu item that locks the string",
  },
  unlock: {
    defaultMessage: "Unlock string",
    id: "wYm1Av6k2L",
    description: "Per-string menu item that unlocks the string",
  },
  activity: {
    defaultMessage: "View activity",
    id: "HB+x7NCsPK",
    description: "Per-string menu item that opens the string activity history",
  },
});

export const contentEditorFindContextMessages = defineMessages({
  refreshContext: {
    defaultMessage: "Refresh context",
    id: "dIpX2t1U6p",
    description: "Re-runs the repository context lookup once context has been found",
  },
});
