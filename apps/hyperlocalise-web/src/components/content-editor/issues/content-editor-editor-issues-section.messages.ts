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

export const contentEditorEditorIssuesSectionMessages = defineMessages({
  title: {
    defaultMessage: "Board",
    id: "D2Iw7bGHIc",
    description: "Heading for the CAT segment Board section",
  },
  createIssue: {
    defaultMessage: "New issue",
    id: "xj9AZAhTSo",
    description: "Button to create a new issue linked to the current CAT segment",
  },
  emptyTitle: {
    defaultMessage: "No issues for this string",
    id: "Esr6tXDJJe",
    description: "Empty-state title when the CAT segment has no linked issues",
  },
  emptyDescription: {
    defaultMessage: "Create an issue to track work on this string.",
    id: "8qNqRTyyLK",
    description: "Empty-state description when the CAT segment has no linked issues",
  },
  loadError: {
    defaultMessage: "Could not load issues.",
    id: "thNgDb6rW2",
    description: "Error message when CAT segment board issues fail to load",
  },
  unavailable: {
    defaultMessage: "Board is unavailable for this string.",
    id: "T7+otbWCxu",
    description: "Shown when the CAT segment cannot link to the Board (missing translation key)",
  },
  requestFailed: {
    defaultMessage: "Request failed",
    id: "JprxqupePC",
    description: "Generic fallback when a CAT Board API request fails",
  },
  close: {
    defaultMessage: "Close board",
    id: "sHe4qCdT7b",
    description: "Accessible label for closing the CAT Board panel",
  },
});
