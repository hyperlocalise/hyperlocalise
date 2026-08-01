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

export const catFileViewMessages = defineMessages({
  sourceHeading: {
    defaultMessage: "Source ({locale})",
    id: "k2FmVp9xQw",
    description: "Heading for the source file pane in CAT File view",
  },
  targetHeading: {
    defaultMessage: "Translated ({locale})",
    id: "n8RtYc4hLm",
    description: "Heading for the translated file pane in CAT File view",
  },
  uploadFile: {
    defaultMessage: "Upload translated file",
    id: "p3WsKd7nBv",
    description: "Button to upload a replacement translated file in CAT File view",
  },
  regenerate: {
    defaultMessage: "Regenerate",
    id: "q6HjXe1oZa",
    description: "Button to regenerate the translated file with the agent in CAT File view",
  },
  approve: {
    defaultMessage: "Approve",
    id: "r9UcMb5tYi",
    description: "Primary action to approve the translated file in CAT File view",
  },
  previewUnsupported: {
    defaultMessage: "Preview is not available for this file type yet.",
    id: "s4LgNf2wPj",
    description: "Empty state when CAT File view has no registered preview adapter",
  },
  sourceEmpty: {
    defaultMessage: "Source file unavailable",
    id: "t7ApQd8kRu",
    description: "Empty state when the CAT File view source preview cannot be shown",
  },
  targetEmpty: {
    defaultMessage: "No translated file yet",
    id: "u1CvEs6mXo",
    description: "Empty state when the CAT File view target preview has no file",
  },
  imageSourceAlt: {
    defaultMessage: "Source image",
    id: "v5DwGt3nYp",
    description: "Alt text for the source image in CAT File view",
  },
  imageTargetAlt: {
    defaultMessage: "Translated image",
    id: "w8FxHu0qZs",
    description: "Alt text for the translated image in CAT File view",
  },
});
