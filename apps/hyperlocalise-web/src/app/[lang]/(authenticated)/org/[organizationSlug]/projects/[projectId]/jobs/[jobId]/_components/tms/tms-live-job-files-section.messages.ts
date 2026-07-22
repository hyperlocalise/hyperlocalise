"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const tmsLiveJobFilesSectionMessages = defineMessages({
  failedToLoadTaskFiles: {
    defaultMessage: "Failed to load task files ({status})",
    id: "BnlCirDHql",
    description: "Error when the live TMS job files request fails",
  },
  unableToLoadTaskFiles: {
    defaultMessage: "Unable to load task files",
    id: "L80pAvj6yJ",
    description: "Fallback error when task files fail to load without an Error message",
  },
  noFilesLinked: {
    defaultMessage: "No files are linked to this task.",
    id: "bHnFWGWqed",
    description: "Empty state when a live TMS job has no linked files",
  },
});
