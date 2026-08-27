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
  failedToUpdateVideoMode: {
    defaultMessage: "Failed to update video mode",
    id: "VaRVOa2ruT",
    description: "Fallback error when toggling treat-as-video mode fails",
  },
  failedToUpdateHiddenStrings: {
    defaultMessage: "Failed to update hidden strings",
    id: "1BOxhADmQk",
    description: "Fallback error when hiding or unhiding native CAT source strings fails",
  },
  cannotEditHiddenStringTranslation: {
    defaultMessage:
      "Hidden strings can't be edited from the CAT. Unhide the string in Crowdin first.",
    id: "sfQrLcactN",
    description: "Error when saving a translation for a hidden string",
  },
  cannotEditLockedStringTranslation: {
    defaultMessage: "Locked strings can't be edited from the CAT. Unlock the string first.",
    id: "kWfjLcxlRC",
    description: "Error when saving a translation for a locked CAT segment",
  },
  failedToUpdateLockedStrings: {
    defaultMessage: "Failed to update locked strings",
    id: "dKnvI39kVF",
    description: "Fallback error when locking or unlocking CAT segments fails",
  },
  failedToUpdateMaxLength: {
    defaultMessage: "Failed to update character limit",
    id: "ElyQMTBOLz",
    description: "Fallback error when updating a native segment max length fails",
  },
});
