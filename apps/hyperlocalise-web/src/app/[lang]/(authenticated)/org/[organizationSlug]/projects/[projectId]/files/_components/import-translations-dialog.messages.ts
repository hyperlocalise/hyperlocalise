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

export const importTranslationsDialogMessages = defineMessages({
  title: {
    defaultMessage: "Import translations",
    id: "P8KTrbj6Tz",
    description: "Title of the import translations dialog",
  },
  description: {
    defaultMessage:
      "Upload an already-translated file for {path}. Keys are matched to the source file and imported as approved.",
    id: "gW2WlKWiCg",
    description: "Description of the import translations dialog, with the source file path",
  },
  noTargetLocales: {
    defaultMessage: "Add target locales in project settings before importing translations.",
    id: "LFJfgZO4Go",
    description: "Hint when the project has no target locales for import",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "Hs6SYEddPH",
    description: "Label for the target locale radio list in the import dialog",
  },
  translationFileLabel: {
    defaultMessage: "Translation file",
    id: "hAPzbQIEDY",
    description: "Label for the translation file picker in the import dialog",
  },
  chooseFile: {
    defaultMessage: "Choose file",
    id: "tX7cZ1uzA9",
    description: "Button to open the file picker for importing translations",
  },
  noFileSelected: {
    defaultMessage: "No file selected",
    id: "6BAhCIK1FN",
    description: "Placeholder when no translation file has been chosen for import",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "uU2AXyYsXb",
    description: "Cancel button in the import translations dialog footer",
  },
  import: {
    defaultMessage: "Import",
    id: "rh90m8ZlQ4",
    description: "Submit button in the import translations dialog footer",
  },
  selectLocale: {
    defaultMessage: "Select a target locale.",
    id: "JZfUqPa7pu",
    description: "Validation error when importing without a target locale",
  },
  chooseFileRequired: {
    defaultMessage: "Choose a translation file to import.",
    id: "hZ+ve9l5zX",
    description: "Validation error when importing without a selected file",
  },
  unsupportedFormat: {
    defaultMessage: "This file format is not supported for translation import.",
    id: "JrFNiTkZaR",
    description: "Validation error when the source file format cannot be imported",
  },
  importFailed: {
    defaultMessage: "Failed to import translations",
    id: "FmXSWHs9O2",
    description: "Fallback error when importing translations fails",
  },
  importSuccess: {
    defaultMessage: "Import started — translations will appear once processing completes.",
    id: "TP90PKsFP9",
    description: "Toast when a translation import is started successfully",
  },
});
