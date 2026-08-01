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
    id: "LZCFkSSHP6",
    description: "Heading for the source file pane in CAT File view",
  },
  targetHeading: {
    defaultMessage: "Translated ({locale})",
    id: "VkWvhhKis5",
    description: "Heading for the translated file pane in CAT File view",
  },
  uploadFile: {
    defaultMessage: "Upload translated file",
    id: "NglzlEjVxr",
    description: "Button to upload a replacement translated file in CAT File view",
  },
  regenerate: {
    defaultMessage: "Regenerate",
    id: "xVvlWpH5FH",
    description: "Button to regenerate the translated file with the agent in CAT File view",
  },
  saveEdits: {
    defaultMessage: "Save edits",
    id: "gXL7Y0+DUP",
    description: "Button to export Univer edits and upload the translated office file",
  },
  approve: {
    defaultMessage: "Approve",
    id: "NXryL5pUgk",
    description: "Primary action to approve the translated file in CAT File view",
  },
  previewUnsupported: {
    defaultMessage: "Preview is not available for this file type yet.",
    id: "x8Rt8oWLMk",
    description: "Empty state when CAT File view has no registered preview adapter",
  },
  sourceEmpty: {
    defaultMessage: "Source file unavailable",
    id: "1c3qg2u74K",
    description: "Empty state when the CAT File view source preview cannot be shown",
  },
  targetEmpty: {
    defaultMessage: "No translated file yet",
    id: "3wxYCVb3wu",
    description: "Empty state when the CAT File view target preview has no file",
  },
  imageSourceAlt: {
    defaultMessage: "Source image",
    id: "86pJK6MuXF",
    description: "Alt text for the source image in CAT File view",
  },
  imageTargetAlt: {
    defaultMessage: "Translated image",
    id: "GWzwxQbAhe",
    description: "Alt text for the translated image in CAT File view",
  },
  previousFileAria: {
    defaultMessage: "Previous file",
    id: "tUQYErY0nj",
    description: "Accessible label for previous-file navigation in CAT File view",
  },
  nextFileAria: {
    defaultMessage: "Next file",
    id: "ShnGyATeRG",
    description: "Accessible label for next-file navigation in CAT File view",
  },
});
