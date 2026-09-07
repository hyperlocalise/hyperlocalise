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
    defaultMessage: "Queries",
    id: "zI9Ceuo8wd",
    description: "Heading for the CAT segment Queries section",
  },
  createIssue: {
    defaultMessage: "New issue",
    id: "xj9AZAhTSo",
    description: "Button to create a new issue linked to the current CAT segment",
  },
  emptyTitle: {
    defaultMessage: "No issues for this string",
    id: "JXB2wuhw1Z",
    description: "Empty-state title when the CAT segment has no linked issues",
  },
  emptyDescription: {
    defaultMessage: "Create an issue to track work on this string.",
    id: "vqmXbSZwqU",
    description: "Empty-state description when the CAT segment has no linked issues",
  },
  loadError: {
    defaultMessage: "Could not load issues.",
    id: "mBox3Bi4Wv",
    description: "Error message when CAT segment Queries issues fail to load",
  },
  unavailable: {
    defaultMessage: "Queries is unavailable for this string.",
    id: "MbppXfDsbM",
    description: "Shown when the CAT segment cannot link to Queries (missing translation key)",
  },
  requestFailed: {
    defaultMessage: "Request failed",
    id: "+gp2sOH/Py",
    description: "Generic fallback when a CAT Queries API request fails",
  },
  close: {
    defaultMessage: "Close Queries",
    id: "sqEo4EAhoy",
    description: "Accessible label for closing the CAT Queries panel",
  },
});
