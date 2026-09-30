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

export const issueSourcePathPickerMessages = defineMessages({
  searchPlaceholder: {
    defaultMessage: "Search files…",
    id: "poLxV0+BEN",
    description: "Placeholder for source path file picker search",
  },
  empty: {
    defaultMessage: "No files found.",
    id: "XkO72fy/02",
    description: "Empty state when source path search has no matches",
  },
  loading: {
    defaultMessage: "Loading files…",
    id: "nhtRMCbbPU",
    description: "Loading state for source path file picker",
  },
  clear: {
    defaultMessage: "No file",
    id: "8aspU1tGYY",
    description: "Option to clear the issue source path",
  },
  filesGroup: {
    defaultMessage: "Files",
    id: "LH5KuNV+zy",
    description: "Group label for selectable project files",
  },
  triggerAria: {
    defaultMessage: "Select source file",
    id: "pQQEeDnNjz",
    description: "Accessible label for the source path picker trigger",
  },
  loadError: {
    defaultMessage: "Could not load files.",
    id: "dwwAnbuf/E",
    description: "Error when the source path file list fails to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "fITJU4tvCM",
    description: "Retry loading source path files after a failure",
  },
});
