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

export const contentEditorActivityLogMessages = defineMessages({
  openAria: {
    defaultMessage: "Show file activity",
    id: "7qG8V9eHbJ",
    description: "Accessible label for the file editor activity log button",
  },
  title: {
    defaultMessage: "Activity",
    id: "2uw5+lQ54T",
    description: "Title for the file editor activity dialog",
  },
  description: {
    defaultMessage: "Changes to this file and its strings.",
    id: "VL1n4lhYVe",
    description: "Description for the file editor activity dialog",
  },
  allFilesDescription: {
    defaultMessage: "Changes to files and strings in this project.",
    id: "1Kqhhea0Ee",
    description: "Description for the All Files activity dialog",
  },
  loading: {
    defaultMessage: "Loading activity…",
    id: "mF2ibzlVS8",
    description: "Loading state for the file editor activity dialog",
  },
  emptyTitle: {
    defaultMessage: "No activity yet",
    id: "CrdjVes1wn",
    description: "Empty state title for the file editor activity dialog",
  },
  emptyDescription: {
    defaultMessage: "Approvals, comments, and file changes will appear here.",
    id: "kKTupKEcTR",
    description: "Empty state description for the file editor activity dialog",
  },
  loadError: {
    defaultMessage: "Activity could not be loaded.",
    id: "m3RSvNywAR",
    description: "Error title when file editor activity fails to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "rttw694uiK",
    description: "Retry button for the file editor activity dialog",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "l1mlJzFoj/",
    description: "Load more button for the file editor activity dialog",
  },
});
