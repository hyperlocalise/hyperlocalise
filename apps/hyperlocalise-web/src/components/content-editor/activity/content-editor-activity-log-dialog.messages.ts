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

export const contentEditorActivityLogDialogMessages = defineMessages({
  title: {
    defaultMessage: "Activity",
    id: "ceActTitle",
    description: "Title for the content editor activity log dialog",
  },
  description: {
    defaultMessage: "Recent changes to this file and its strings.",
    id: "ceActDescription",
    description: "Description for the content editor activity log dialog",
  },
  allFilesDescription: {
    defaultMessage: "Recent file and string changes in this project.",
    id: "ceActAllFilesDescription",
    description: "Description for the content editor activity log when viewing all files",
  },
  loading: {
    defaultMessage: "Loading activity…",
    id: "ceActLoading",
    description: "Loading state for the content editor activity log dialog",
  },
  emptyTitle: {
    defaultMessage: "No activity yet",
    id: "ceActEmptyTitle",
    description: "Empty state title for the content editor activity log dialog",
  },
  emptyDescription: {
    defaultMessage: "Approvals, locks, imports, and other changes will appear here.",
    id: "ceActEmptyDescription",
    description: "Empty state description for the content editor activity log dialog",
  },
  loadError: {
    defaultMessage: "Activity could not be loaded.",
    id: "ceActLoadError",
    description: "Error message when the content editor activity log fails to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "ceActRetry",
    description: "Retry button for the content editor activity log dialog",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "ceActLoadMore",
    description: "Load more button for the content editor activity log dialog",
  },
});
