"use client";

import { defineMessages } from "react-intl";

export const issueSheetImportDialogMessages = defineMessages({
  title: {
    defaultMessage: "Import issues from CSV",
    id: "h5YfBD98F1",
    description: "Title of the Issue Sheet CSV import dialog",
  },
  description: {
    defaultMessage:
      "Upload a spreadsheet export, map columns to Issue Sheet fields, preview the result, then import.",
    id: "/WFoDeqxe7",
    description: "Description of the Issue Sheet CSV import dialog",
  },
  chooseCsvFile: {
    defaultMessage: "Choose a CSV file",
    id: "OXTjKr806t",
    description: "Primary label on the CSV upload drop zone",
  },
  csvLimits: {
    defaultMessage: "UTF-8 CSV up to 2 MB and 2,000 rows",
    id: "uYFDr/Lkl1",
    description: "Helper text describing CSV size and row limits for import",
  },
  columnsBadge: {
    defaultMessage: "{count} columns",
    id: "j28e0kftL8",
    description: "Badge showing how many CSV columns were detected",
  },
  previewRowsBadge: {
    defaultMessage: "{count} preview rows",
    id: "lpIsUoLsfZ",
    description: "Badge showing how many preview rows are shown while mapping",
  },
  csvColumnHeader: {
    defaultMessage: "CSV column",
    id: "Qpt4IfmhcE",
    description: "Table header for the CSV column name in the mapping step",
  },
  mapsToHeader: {
    defaultMessage: "Maps to",
    id: "l50K3EMdhi",
    description: "Table header for the target field mapping in the import dialog",
  },
  sampleHeader: {
    defaultMessage: "Sample",
    id: "Fm0jcJBPFw",
    description: "Table header for sample CSV values in the mapping step",
  },
  chooseMapping: {
    defaultMessage: "Choose mapping",
    id: "UpaZ1YNWPu",
    description: "Placeholder for the CSV column mapping select",
  },
  columnTypePlaceholder: {
    defaultMessage: "Column type",
    id: "F4De2ityOJ",
    description: "Placeholder for the new column type select during CSV import",
  },
  skipMapping: {
    defaultMessage: "Skip",
    id: "c6U0JK/OgK",
    description: "Mapping option to skip a CSV column during import",
  },
  createMapping: {
    defaultMessage: "Create: {label}",
    id: "MQK2DQjTRa",
    description: "Mapping option to create a new Issue Sheet column from a CSV header",
  },
  systemFieldTitle: {
    defaultMessage: "Title",
    id: "fN0HtiBs3L",
    description: "System field mapping label for issue title",
  },
  systemFieldDescription: {
    defaultMessage: "Description",
    id: "kAj/pNbn2C",
    description: "System field mapping label for issue description",
  },
  systemFieldStatus: {
    defaultMessage: "Status",
    id: "QhAV2nb4PW",
    description: "System field mapping label for issue status",
  },
  systemFieldType: {
    defaultMessage: "Type",
    id: "BvipsKvoDg",
    description: "System field mapping label for issue type",
  },
  systemFieldLocale: {
    defaultMessage: "Locale",
    id: "ehBAg1ZBrW",
    description: "System field mapping label for target locale",
  },
  systemFieldSourcePath: {
    defaultMessage: "Source path",
    id: "Q0EogeA8A+",
    description: "System field mapping label for source path",
  },
  systemFieldSegmentId: {
    defaultMessage: "Segment ID",
    id: "ApamhQbkDH",
    description: "System field mapping label for segment ID",
  },
  systemFieldExternalId: {
    defaultMessage: "External ID",
    id: "wsTBhVto6A",
    description: "System field mapping label for external reference",
  },
  systemFieldLinkUrl: {
    defaultMessage: "Link URL",
    id: "sbs/6w0fyz",
    description: "System field mapping label for link URL",
  },
  systemFieldAssignee: {
    defaultMessage: "Assignee",
    id: "4LIUIf2s6l",
    description: "System field mapping label for assignee",
  },
  rowsBadge: {
    defaultMessage: "{count} rows",
    id: "Erp8YPXBb/",
    description: "Badge showing total CSV rows in the import preview",
  },
  toImportBadge: {
    defaultMessage: "{count} to import",
    id: "DTZcGNPK0v",
    description: "Badge showing how many issues will be created by the import",
  },
  duplicatesSkippedBadge: {
    defaultMessage: "{count} duplicates skipped",
    id: "GuYiT4dWiy",
    description: "Badge showing how many duplicate rows will be skipped",
  },
  invalidSkippedBadge: {
    defaultMessage: "{count} invalid skipped",
    id: "UA3ioLbPld",
    description: "Badge showing how many invalid rows will be skipped",
  },
  newColumns: {
    defaultMessage: "New columns: {columns}",
    id: "B4Gf1Duzbc",
    description: "Lists new Issue Sheet columns that will be created by the import",
  },
  warningsTitle: {
    defaultMessage: "Warnings",
    id: "iuBZTCJ+YX",
    description: "Heading for import preview warnings",
  },
  errorsTitle: {
    defaultMessage: "Errors",
    id: "WAtboHlCdj",
    description: "Heading for import preview errors",
  },
  rowMessage: {
    defaultMessage: "Row {row}: {message}",
    id: "+VZ90aAk+9",
    description: "Import warning or error line with a CSV row number",
  },
  importSummaryCreated: {
    defaultMessage: "{count, plural, one {Imported # issue.} other {Imported # issues.}}",
    id: "lrK4pC9l8o",
    description: "Created-count sentence in the Issue Sheet CSV import success summary",
  },
  importSummaryDuplicates: {
    defaultMessage: "{count, plural, one {Skipped # duplicate} other {Skipped # duplicates}}",
    id: "L3GKZlsWdz",
    description: "Duplicate-skip sentence in the Issue Sheet CSV import success summary",
  },
  importSummaryInvalid: {
    defaultMessage: "{count, plural, one {and # invalid row.} other {and # invalid rows.}}",
    id: "MxRBhpGKS4",
    description: "Invalid-skip sentence in the Issue Sheet CSV import success summary",
  },
  close: {
    defaultMessage: "Close",
    id: "bfKQmDUNTz",
    description: "Button to close the Issue Sheet import dialog",
  },
  back: {
    defaultMessage: "Back",
    id: "nOxKk6N2iw",
    description: "Button to go to the previous step in the Issue Sheet import dialog",
  },
  previewImport: {
    defaultMessage: "Preview import",
    id: "5FDuQWvCGc",
    description: "Button to dry-run the Issue Sheet CSV import",
  },
  importIssues: {
    defaultMessage: "{count, plural, one {Import # issue} other {Import # issues}}",
    id: "RdktJbaSwg",
    description: "Button to confirm importing issues from CSV",
  },
  done: {
    defaultMessage: "Done",
    id: "UWtBPjqoSn",
    description: "Button to close the Issue Sheet import dialog after success",
  },
  uploadCsvRequired: {
    defaultMessage: "Upload a UTF-8 CSV file",
    id: "JO5M8qgbCX",
    description: "Toast when the selected file is not a CSV",
  },
  parseCsvFailed: {
    defaultMessage: "Could not parse CSV",
    id: "tn0uMdvPeH",
    description: "Fallback toast when CSV parsing fails",
  },
  importFailed: {
    defaultMessage: "Import failed",
    id: "rBC3hmwUDA",
    description: "Fallback toast when Issue Sheet CSV import fails",
  },
  importSuccess: {
    defaultMessage: "{count, plural, one {Imported # issue} other {Imported # issues}}",
    id: "0WhMJRn0yU",
    description: "Toast when Issue Sheet CSV import completes successfully",
  },
});
