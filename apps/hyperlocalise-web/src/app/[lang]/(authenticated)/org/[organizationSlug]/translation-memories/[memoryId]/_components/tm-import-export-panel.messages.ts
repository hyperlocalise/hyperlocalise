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

export const tmImportExportPanelMessages = defineMessages({
  import: {
    defaultMessage: "Import",
    id: "Z3fCUPrSEf",
    description: "Button to import translation memory entries from a CSV or TMX file",
  },
  importLabel: {
    defaultMessage: "Import CSV or TMX file",
    id: "B1NsXVl3wA",
    description: "Accessible label for the hidden translation memory import file input",
  },
  importDialogTitle: {
    defaultMessage: "Import translation memory",
    id: "mkH7b+PHw3",
    description: "Title for the translation memory file picker dialog",
  },
  importDialogDescription: {
    defaultMessage: "Upload a CSV or TMX file to preview entries before importing them.",
    id: "zjaWdYv0nT",
    description: "Description for the translation memory file picker dialog",
  },
  selectImportFile: {
    defaultMessage: "Choose a CSV or TMX file",
    id: "5g8T9JckU6",
    description: "Prompt inside the translation memory file upload area",
  },
  importFormats: {
    defaultMessage: "CSV or TMX · preview before saving",
    id: "G8JuD34Z/q",
    description: "Accepted translation memory import formats",
  },
  previewTitle: {
    defaultMessage: "Import preview",
    id: "xdbeUj+7xL",
    description: "Title for the translation memory import preview dialog",
  },
  previewDescription: {
    defaultMessage:
      "Review totals and warnings before writing entries. Nothing has been saved yet.",
    id: "EzYVHD/5u/",
    description: "Description for the translation memory import preview dialog",
  },
  confirmImport: {
    defaultMessage: "Import entries",
    id: "ITgty4cmkV",
    description: "Button to confirm a translation memory import after preview",
  },
  cancelPreview: {
    defaultMessage: "Cancel",
    id: "07zZke+A8Q",
    description: "Button to close the translation memory import preview without writing",
  },
  exportTmx: {
    defaultMessage: "Export",
    id: "wJpMrv20rr",
    description: "Button to open translation memory export options",
  },
  exportTitle: {
    defaultMessage: "Export translation memory",
    id: "NiKahdIm+v",
    description: "Title for the translation memory TMX export dialog",
  },
  exportDescription: {
    defaultMessage:
      "Download the full memory, or limit the file to one source and target locale pair.",
    id: "68oR+M/HhK",
    description: "Description for the translation memory TMX export dialog",
  },
  exportAll: {
    defaultMessage: "Download all locales",
    id: "jUCQWPQBsD",
    description: "Button to export the full translation memory as TMX",
  },
  exportPair: {
    defaultMessage: "Download locale pair",
    id: "USK9hbsD4S",
    description: "Button to export a filtered locale pair as TMX",
  },
  sourceLocaleLabel: {
    defaultMessage: "Source locale",
    id: "E5FKq7Jvuw",
    description: "Label for the optional TMX export source locale",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "0d2hyvxzDu",
    description: "Label for the optional TMX export target locale",
  },
  reportTotalRead: {
    defaultMessage: "Read {count, number}",
    id: "iBXkIW24Rq",
    description: "Import report count for translation units read from the file",
  },
  reportCreated: {
    defaultMessage: "Created {count, number}",
    id: "vHk0Yz7eWC",
    description: "Import report count for created translation memory entries",
  },
  reportUpdated: {
    defaultMessage: "Updated {count, number}",
    id: "xdxiFYu6GL",
    description: "Import report count for updated translation memory entries",
  },
  reportVariants: {
    defaultMessage: "Variants {count, number}",
    id: "/bULn4h8+q",
    description: "Import report count for additional target-language variants created",
  },
  reportSkipped: {
    defaultMessage: "Skipped {count, number}",
    id: "NuqrR6P28s",
    description: "Import report count for skipped translation memory entries",
  },
  reportWarned: {
    defaultMessage: "Warnings {count, number}",
    id: "9HTuUWVfNj",
    description: "Import report count for validation warnings",
  },
  reportFailed: {
    defaultMessage: "Failed {count, number}",
    id: "5e/b9i22H4",
    description: "Import report count for failed translation units",
  },
  issuesTitle: {
    defaultMessage: "Unit issues",
    id: "fA0++N9x3W",
    description: "Heading for import validation issues",
  },
  previewEntriesTitle: {
    defaultMessage: "Sample entries",
    id: "K5K8zG3viH",
    description: "Heading for import preview sample rows",
  },
  importFileTooLarge: {
    defaultMessage:
      "This file is larger than the {maxMegabytes, number} MB import limit. Split the memory into smaller TMX files.",
    id: "S1WdU+6z/U",
    description: "Error when a translation memory import file exceeds the documented size limit",
  },
  importFailed: {
    defaultMessage: "Unable to import entries",
    id: "VxRWiDyH8o",
    description: "Fallback error when translation memory import fails",
  },
  exportFailed: {
    defaultMessage: "Unable to export TMX",
    id: "AzlAJgQRne",
    description: "Fallback error when translation memory TMX export fails",
  },
});
