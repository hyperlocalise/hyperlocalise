"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const useCatMutationsMessages = defineMessages({
  missingSegmentSourceFile: {
    defaultMessage: "Cannot save because the segment source file is missing.",
    id: "rPDum93Cv6",
    description: "Error when a CAT mutation cannot resolve the segment source path",
  },
  failedToSaveTranslation: {
    defaultMessage: "Failed to save translation",
    id: "Shd5zCFQ4K",
    description: "Fallback error when saving a CAT translation fails",
  },
  failedToPostComment: {
    defaultMessage: "Failed to post comment",
    id: "HznKjevFZV",
    description: "Fallback error when posting a CAT comment fails",
  },
  failedToResolveIssue: {
    defaultMessage: "Failed to resolve issue",
    id: "AGTfsc7LIQ",
    description: "Fallback error when resolving a CAT issue fails",
  },
  failedToRegenerateImage: {
    defaultMessage: "Failed to regenerate image",
    id: "g4IjA7F0HP",
    description: "Fallback error when regenerating a CAT image translation fails",
  },
  failedToUploadImage: {
    defaultMessage: "Failed to upload image",
    id: "RUamuSnsW6",
    description: "Fallback error when uploading a CAT image translation fails",
  },
  failedToUpdateImageMode: {
    defaultMessage: "Failed to update image mode",
    id: "q7Osr9MF9k",
    description: "Fallback error when toggling treat-as-image mode fails",
  },
});
