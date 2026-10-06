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
    defaultMessage:
      "Upload a CSV or TMX file. The import runs in the background and opens a report page where you can review the preview before confirming.",
    id: "ltxCMN20rv",
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
  preparingPreview: {
    defaultMessage: "Uploading the file and starting the import preview...",
    id: "Nm2u0vLRPr",
    description: "Status while a translation memory import file uploads and queues its preview",
  },
  uploadFailed: {
    defaultMessage: "Unable to upload the import file",
    id: "YzjNdEvRAt",
    description: "Fallback error when a translation memory import file upload fails",
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
      "Download the full memory, or limit the file to one source and target locale pair. Choose CSV or TMX.",
    id: "M9z6IP66I+",
    description: "Description for the translation memory export dialog",
  },
  exportFormatLabel: {
    defaultMessage: "File format",
    id: "YKjwh2TMfB",
    description: "Label for translation memory export format selection",
  },
  exportFormatTmx: {
    defaultMessage: "TMX",
    id: "4KanasHCcU",
    description: "Translation memory export format option for TMX",
  },
  exportFormatCsv: {
    defaultMessage: "CSV",
    id: "W8ahbI8++r",
    description: "Translation memory export format option for CSV",
  },
  exportAll: {
    defaultMessage: "Download all locales",
    id: "G1vKHQVWch",
    description: "Button to export the full translation memory",
  },
  exportPair: {
    defaultMessage: "Download locale pair",
    id: "TCrC82tmQg",
    description: "Button to export a filtered locale pair",
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
  importFileTooLarge: {
    defaultMessage:
      "This file is larger than the {maxMegabytes, number} MB import limit. Split the memory into smaller TMX files.",
    id: "S1WdU+6z/U",
    description: "Error when a translation memory import file exceeds the documented size limit",
  },
  unsupportedImportFormat: {
    defaultMessage: "Choose a TMX or CSV file.",
    id: "6Hh/TB07+q",
    description: "Error when a translation memory import file is not TMX or CSV",
  },
  importFailed: {
    defaultMessage: "Unable to import entries",
    id: "VxRWiDyH8o",
    description: "Fallback error when translation memory import fails",
  },
  exportFailed: {
    defaultMessage: "Unable to export translation memory",
    id: "wqZ58St0W3",
    description: "Fallback error when translation memory export fails",
  },
});
