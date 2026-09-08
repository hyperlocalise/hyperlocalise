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
    id: "cAt1oPnA9v",
    description: "Accessible label for the file editor activity log button",
  },
  title: {
    defaultMessage: "Activity",
    id: "cAt2tItL0w",
    description: "Title for the file editor activity dialog",
  },
  description: {
    defaultMessage: "Changes to this file and its strings.",
    id: "cAt3dScP1x",
    description: "Description for the file editor activity dialog",
  },
  allFilesDescription: {
    defaultMessage: "Changes to files and strings in this project.",
    id: "cAt4aLfD2y",
    description: "Description for the All Files activity dialog",
  },
  loading: {
    defaultMessage: "Loading activity…",
    id: "cAt5lOdA3z",
    description: "Loading state for the file editor activity dialog",
  },
  emptyTitle: {
    defaultMessage: "No activity yet",
    id: "cAt6eMpT4a",
    description: "Empty state title for the file editor activity dialog",
  },
  emptyDescription: {
    defaultMessage: "Approvals, comments, and file changes will appear here.",
    id: "cAt7eMpD5b",
    description: "Empty state description for the file editor activity dialog",
  },
  loadError: {
    defaultMessage: "Activity could not be loaded.",
    id: "cAt8eRrT6c",
    description: "Error title when file editor activity fails to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "cAt9rTyB7d",
    description: "Retry button for the file editor activity dialog",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "cAt0lDmR8e",
    description: "Load more button for the file editor activity dialog",
  },
});
