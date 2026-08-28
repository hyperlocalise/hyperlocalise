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
  importLabel: {
    defaultMessage: "Import CSV or TMX",
    id: "k2Qm8nVw1A",
    description: "Accessible label for the translation memory import file input",
  },
  previewTitle: {
    defaultMessage: "Import preview",
    id: "p9L4xC2eR7",
    description: "Title for the translation memory import preview dialog",
  },
  resultTitle: {
    defaultMessage: "Import report",
    id: "s1H6bN8tK3",
    description: "Title for the translation memory import result dialog",
  },
  previewDescription: {
    defaultMessage:
      "Review totals and warnings before writing entries. Nothing has been saved yet.",
    id: "w4J0mD5uY9",
    description: "Description for the translation memory import preview dialog",
  },
  resultDescription: {
    defaultMessage: "The import finished. Use these totals to confirm what changed.",
    id: "a7F3qP1cL6",
    description: "Description for the translation memory import result dialog",
  },
  confirmImport: {
    defaultMessage: "Import entries",
    id: "e8R2vS0hZ5",
    description: "Button to confirm a translation memory import after preview",
  },
  cancelPreview: {
    defaultMessage: "Cancel",
    id: "c3T9gB6nM2",
    description: "Button to close the translation memory import preview without writing",
  },
  closeReport: {
    defaultMessage: "Close",
    id: "d5U1kW7oQ4",
    description: "Button to close the translation memory import report",
  },
  exportTmx: {
    defaultMessage: "Export TMX",
    id: "f6V8iX2pR0",
    description: "Button to open translation memory TMX export options",
  },
  exportTitle: {
    defaultMessage: "Export translation memory",
    id: "g7W4jY9qS1",
    description: "Title for the translation memory TMX export dialog",
  },
  exportDescription: {
    defaultMessage:
      "Download the full memory, or limit the file to one source and target locale pair.",
    id: "h8X5kZ0rT2",
    description: "Description for the translation memory TMX export dialog",
  },
  exportAll: {
    defaultMessage: "Download all locales",
    id: "i9Y6lA1sU3",
    description: "Button to export the full translation memory as TMX",
  },
  exportPair: {
    defaultMessage: "Download locale pair",
    id: "j0Z7mB2tV4",
    description: "Button to export a filtered locale pair as TMX",
  },
  sourceLocaleLabel: {
    defaultMessage: "Source locale",
    id: "k1A8nC3uW5",
    description: "Label for the optional TMX export source locale",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "l2B9oD4vX6",
    description: "Label for the optional TMX export target locale",
  },
  reportTotalRead: {
    defaultMessage: "Read {count, number}",
    id: "m3C0pE5wY7",
    description: "Import report count for translation units read from the file",
  },
  reportCreated: {
    defaultMessage: "Created {count, number}",
    id: "n4D1qF6xZ8",
    description: "Import report count for created translation memory entries",
  },
  reportUpdated: {
    defaultMessage: "Updated {count, number}",
    id: "o5E2rG7yA9",
    description: "Import report count for updated translation memory entries",
  },
  reportVariants: {
    defaultMessage: "Variants {count, number}",
    id: "p6F3sH8zB0",
    description: "Import report count for additional target-language variants created",
  },
  reportSkipped: {
    defaultMessage: "Skipped {count, number}",
    id: "q7G4tI9aC1",
    description: "Import report count for skipped translation memory entries",
  },
  reportWarned: {
    defaultMessage: "Warnings {count, number}",
    id: "r8H5uJ0bD2",
    description: "Import report count for validation warnings",
  },
  reportFailed: {
    defaultMessage: "Failed {count, number}",
    id: "s9I6vK1cE3",
    description: "Import report count for failed translation units",
  },
  issuesTitle: {
    defaultMessage: "Unit issues",
    id: "t0J7wL2dF4",
    description: "Heading for import validation issues",
  },
  previewEntriesTitle: {
    defaultMessage: "Sample entries",
    id: "u1K8xM3eG5",
    description: "Heading for import preview sample rows",
  },
  importFailed: {
    defaultMessage: "Unable to import entries",
    id: "v2L9yN4fH6",
    description: "Fallback error when translation memory import fails",
  },
  exportFailed: {
    defaultMessage: "Unable to export TMX",
    id: "w3M0zO5gI7",
    description: "Fallback error when translation memory TMX export fails",
  },
  entriesImported: {
    defaultMessage:
      "Imported {created, number} new and {updated, number} updated entries",
    id: "x4N1aP6hJ8",
    description: "Toast after a translation memory import completes",
  },
});
