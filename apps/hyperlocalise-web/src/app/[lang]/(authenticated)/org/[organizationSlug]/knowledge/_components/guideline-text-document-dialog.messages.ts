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

export const guidelineTextDocumentDialogMessages = defineMessages({
  createTitle: {
    defaultMessage: "New guideline",
    id: "SQWxPmzi1h",
    description: "Title for the new typed guideline dialog",
  },
  createDescription: {
    defaultMessage: "Write the guidance. Locales and projects are already set on the upload page.",
    id: "lty6wrMmF0",
    description: "Description for the new typed guideline dialog",
  },
  editTitle: {
    defaultMessage: "Edit guideline",
    id: "zsIearzQCb",
    description: "Title for the edit guideline dialog",
  },
  editDescription: {
    defaultMessage: "Update the title, file, or content of this guideline.",
    id: "MG9BeVzbX5",
    description: "Description for the edit guideline dialog",
  },
  titleLabel: {
    defaultMessage: "Title",
    id: "SrKX6ML4pu",
    description: "Label for the guideline title field",
  },
  contentLabel: {
    defaultMessage: "Content",
    id: "UC1OAjERlk",
    description: "Label for the guideline content field",
  },
  contentPlaceholder: {
    defaultMessage: "Write the guidance…",
    id: "HQKSy02lKS",
    description: "Placeholder for the guideline content editor",
  },
  titleRequired: {
    defaultMessage: "Enter a title.",
    id: "wdSsaQCBt9",
    description: "Validation error when the guideline title is empty",
  },
  titleTooLong: {
    defaultMessage: "Keep the title under 200 characters.",
    id: "tItRctmig2",
    description: "Validation error when the guideline title is too long",
  },
  contentRequired: {
    defaultMessage: "Enter some content.",
    id: "EH5Z9+FhIV",
    description: "Validation error when the guideline content is empty",
  },
  contentTooLong: {
    defaultMessage: "Keep the content under 50,000 characters.",
    id: "MQj23Fe9g7",
    description: "Validation error when the guideline content is too long",
  },
  loadFailed: {
    defaultMessage: "Could not load the guideline content.",
    id: "KPaEFeNjPF",
    description: "Error when the guideline document content fails to load",
  },
  saveFailed: {
    defaultMessage: "Could not save the guideline.",
    id: "7CDc+swpug",
    description: "Error when saving the typed guideline document fails",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "vNi51CeSyQ",
    description: "Cancel button in the guideline dialog",
  },
  save: {
    defaultMessage: "Save guideline",
    id: "cfsFKcP3Bc",
    description: "Save button in the guideline dialog",
  },
  useTemplate: {
    defaultMessage: "Use template",
    id: "FRRCcGcc6B",
    description: "Button that fills the new-guideline content with the starter template",
  },
});
