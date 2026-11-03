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

export const projectFileImportSettingsDialogMessages = defineMessages({
  title: {
    defaultMessage: "Import filters",
    id: "+uLF/HX2Vk",
    description: "Title of the per-file import filter dialog",
  },
  description: {
    defaultMessage: "Control which strings this file imports. Saving re-reads the file.",
    id: "rESRbutFXn",
    description: "Description of the per-file import filter dialog",
  },
  unsupported: {
    defaultMessage: "This file type has no extra import filters.",
    id: "i3xNDFJAo9",
    description: "Shown when the selected file cannot use import filters",
  },
  htmlExcludedLabel: {
    defaultMessage: "Skip these HTML tags",
    id: "y+3an6BQ1Y",
    description: "Label for extra HTML tags to exclude from import",
  },
  htmlExcludedHint: {
    defaultMessage: "One tag name per line, in addition to head, script, style, and pre.",
    id: "ETeuBsnEYM",
    description: "Hint for HTML excluded tag names",
  },
  htmlExcludedPlaceholder: {
    defaultMessage: "nav\nfooter",
    id: "vxWXD/yiTP",
    description: "Placeholder for HTML excluded tag names",
  },
  icuSubfilterLabel: {
    defaultMessage: "ICU sub-filter",
    id: "JpP4nc8IcB",
    description: "Label for treating matching strings as ICU MessageFormat",
  },
  icuSubfilterHint: {
    defaultMessage: "Mark strings that contain ICU arguments so they validate as ICU.",
    id: "/OlbcrmkUX",
    description: "Hint for the ICU sub-filter checkbox",
  },
  htmlSubfilterLabel: {
    defaultMessage: "HTML sub-filter",
    id: "uBuX1gN2I5",
    description: "Label for treating matching JSON strings as HTML",
  },
  htmlSubfilterHint: {
    defaultMessage: "Mark strings that contain HTML tags so they validate as HTML.",
    id: "I3jsEhp8EX",
    description: "Hint for the HTML sub-filter checkbox",
  },
  keyPathsLabel: {
    defaultMessage: "Include key paths",
    id: "Omjxdb7wIl",
    description: "Label for JSON key paths to import",
  },
  keyPathsHint: {
    defaultMessage:
      "One dotted path per line. Use * for one segment and ** for the rest. Leave empty to import every string.",
    id: "vVsJslDQBT",
    description: "Hint for JSON include key paths",
  },
  keyPathsPlaceholder: {
    defaultMessage: "messages.*\n*.text",
    id: "o4talEzW4n",
    description: "Placeholder for JSON include key paths",
  },
  excludeKeyPathsLabel: {
    defaultMessage: "Exclude key paths",
    id: "isK0xVIbUs",
    description: "Label for JSON key paths to skip",
  },
  contextFieldsLabel: {
    defaultMessage: "Sibling fields for context",
    id: "lfDVbUWg2+",
    description: "Label for JSON sibling fields copied as translator context",
  },
  contextFieldsHint: {
    defaultMessage:
      "Field names on the same object, one per line. Those fields are not imported as strings.",
    id: "TeRbDN8x03",
    description: "Hint for JSON sibling context fields",
  },
  contextFieldsPlaceholder: {
    defaultMessage: "description\ncontext",
    id: "7JjWKwlwGP",
    description: "Placeholder for JSON sibling context fields",
  },
  limitFieldsLabel: {
    defaultMessage: "Sibling fields for character limit",
    id: "05jUvDQjWy",
    description: "Label for JSON sibling fields used as max length",
  },
  limitFieldsPlaceholder: {
    defaultMessage: "maxLength\ncharacterLimit",
    id: "XBjtqyv7fx",
    description: "Placeholder for JSON sibling character-limit fields",
  },
  excelHeaderLabel: {
    defaultMessage: "First row is a header",
    id: "iNrywGyfgn",
    description: "Label for treating the first Excel row as column names",
  },
  excelHeaderHint: {
    defaultMessage:
      "Turn this off for sheets that start with data. Column positions below are 0-based (A is 0).",
    id: "iWpj/vuBE1",
    description: "Hint for the Excel header-row checkbox",
  },
  excelIdentifierLabel: {
    defaultMessage: "Key column",
    id: "CcKgiJARwK",
    description: "Label for the Excel identifier column index",
  },
  excelSourceLabel: {
    defaultMessage: "Source column",
    id: "0nNWFudqdb",
    description: "Label for the Excel source-text column index",
  },
  excelContextLabel: {
    defaultMessage: "Context column",
    id: "zvnwVPdAGU",
    description: "Label for the Excel context column index",
  },
  excelMaxLengthLabel: {
    defaultMessage: "Character limit column",
    id: "vHbt+8Ajkh",
    description: "Label for the Excel max-length column index",
  },
  excelColumnPlaceholder: {
    defaultMessage: "Auto",
    id: "+QwpaztRql",
    description: "Placeholder when an Excel column index is left empty",
  },
  loadFailed: {
    defaultMessage: "Could not load import filters.",
    id: "iSuHPJi7Ue",
    description: "Error when import filters fail to load",
  },
  saveFailed: {
    defaultMessage: "Could not save import filters.",
    id: "CcFOw9wq1W",
    description: "Error when import filters fail to save",
  },
  saveSuccess: {
    defaultMessage: "Import filters saved. The file is being re-read.",
    id: "bl3sCCu5tP",
    description: "Success toast after saving import filters",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "z3GhOmYfP8",
    description: "Cancel button on the import filter dialog",
  },
  save: {
    defaultMessage: "Save",
    id: "lH6AbCkzBn",
    description: "Save button on the import filter dialog",
  },
  retry: {
    defaultMessage: "Retry",
    id: "e+RlAlQTGC",
    description: "Retry button when import filters fail to load",
  },
});
