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

export const downloadTranslationsDialogMessages = defineMessages({
  title: {
    defaultMessage: "Download translations",
    id: "jLj2gSiaUS",
    description: "Title of the download translations dialog",
  },
  description: {
    defaultMessage: "Choose source files and a target locale to export translated content.",
    id: "GomMnQmb4q",
    description: "Description of the download translations dialog",
  },
  noSourceFiles: {
    defaultMessage: "No source files are available to download.",
    id: "IKqMePX2fP",
    description: "Empty state when there are no source files to download",
  },
  noTargetLocales: {
    defaultMessage: "Add target locales in project settings before downloading translations.",
    id: "v2bCyXiSqg",
    description: "Hint when the project has no target locales for download",
  },
  sourceFilesLabel: {
    defaultMessage: "Source files",
    id: "eKl5zUCITU",
    description: "Label for the source files checklist in the download dialog",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "XqfvXT5zJ1",
    description: "Label for the target locale radio list in the download dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "mPLVbw9Dvq",
    description: "Cancel button in the download translations dialog footer",
  },
  download: {
    defaultMessage: "Download",
    id: "alKFWoCQYb",
    description: "Submit button in the download translations dialog footer",
  },
  selectLocale: {
    defaultMessage: "Select a target locale.",
    id: "3f7/j1QWK0",
    description: "Toast when download is attempted without a target locale",
  },
  selectSourceFile: {
    defaultMessage: "Select at least one source file.",
    id: "/TETuqYPDH",
    description: "Toast when download is attempted without selecting source files",
  },
  downloadSuccess: {
    defaultMessage:
      "{count, plural, one {Translation file downloaded.} other {# translation files downloaded.}}",
    id: "lH4tr3c/1j",
    description: "Toast after translation files download successfully",
  },
  downloadFailed: {
    defaultMessage: "Failed to download translations",
    id: "u9Z5lV8isJ",
    description: "Fallback toast when downloading translations fails",
  },
  downloadFileFailed: {
    defaultMessage: "Failed to download {sourcePath}",
    id: "9hJA/KTyJf",
    description: "Fallback API error when a specific translation file fails to download",
  },
});
