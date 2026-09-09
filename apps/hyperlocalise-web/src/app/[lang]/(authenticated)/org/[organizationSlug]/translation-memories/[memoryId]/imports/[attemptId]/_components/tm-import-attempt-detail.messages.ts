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

export const tmImportAttemptDetailMessages = defineMessages({
  back: {
    defaultMessage: "Back to translation memory",
    id: "fhVxnd1XfU",
    description: "Link from an import report to its translation memory",
  },
  title: {
    defaultMessage: "Import report",
    id: "WgTwa4eiEE",
    description: "Translation memory import report page title",
  },
  subtitle: {
    defaultMessage: "A durable record of this translation memory import.",
    id: "BsHGinE5HI",
    description: "Translation memory import report page description",
  },
  loading: {
    defaultMessage: "Loading import report",
    id: "gq7HYMcSL2",
    description: "Accessible label while an import report loads",
  },
  unavailableTitle: {
    defaultMessage: "Import report unavailable",
    id: "N93OTeCH/5",
    description: "Title for a missing or unauthorized import report",
  },
  unavailableDescription: {
    defaultMessage: "This report does not exist, or you do not have access to it.",
    id: "HvVXRZQQIf",
    description: "Missing or unauthorized import report explanation",
  },
  errorTitle: {
    defaultMessage: "Import report could not be loaded",
    id: "hCTmjlrQ7f",
    description: "Retryable import report error title",
  },
  errorDescription: {
    defaultMessage: "Try again to load the report.",
    id: "zpDcqHTr7W",
    description: "Retryable import report error explanation",
  },
  retry: {
    defaultMessage: "Retry",
    id: "e+PiCZxbnT",
    description: "Retry loading an import report",
  },
  download: {
    defaultMessage: "Download JSON report",
    id: "DpujlokITJ",
    description: "Download a machine-readable import report",
  },
  affectedEntries: {
    defaultMessage: "View affected entries",
    id: "pZzJNiijOV",
    description: "View entries affected by this import",
  },
  overview: {
    defaultMessage: "Overview",
    id: "bsU0qqr6A2",
    description: "Import report overview heading",
  },
  results: {
    defaultMessage: "Results",
    id: "Qcms/Q8NFk",
    description: "Import report counts heading",
  },
  diagnostics: {
    defaultMessage: "Diagnostics",
    id: "uERqNSE1ZH",
    description: "Import report diagnostics heading",
  },
  translationMemory: {
    defaultMessage: "Translation memory",
    id: "jt4oiRYF1R",
    description: "Translation memory field label",
  },
  actor: {
    defaultMessage: "Imported by",
    id: "stUnm5XNi2",
    description: "Import actor field label",
  },
  started: {
    defaultMessage: "Started",
    id: "prQSkX6K0N",
    description: "Import start time field label",
  },
  completedAt: {
    defaultMessage: "Completed",
    id: "Edsl8Xaam8",
    description: "Import completion time field label",
  },
  filename: {
    defaultMessage: "Filename",
    id: "xcHOCv8Mg0",
    description: "Import filename field label",
  },
  byteSize: {
    defaultMessage: "File size",
    id: "7VGSvXfUx3",
    description: "Import byte size field label",
  },
  sha256: {
    defaultMessage: "SHA-256",
    id: "wNYRvbmf7+",
    description: "Import file hash field label",
  },
  format: {
    defaultMessage: "Format",
    id: "AQrXctSpNJ",
    description: "Import format field label",
  },
  options: {
    defaultMessage: "Options",
    id: "Ixg0Dg3icx",
    description: "Import options field label",
  },
  status: {
    defaultMessage: "Status",
    id: "NB0UTxsGrq",
    description: "Import status field label",
  },
  failureCode: {
    defaultMessage: "Failure code",
    id: "P95tFJIvcW",
    description: "Import failure code field label",
  },
  sourceLanguage: {
    defaultMessage: "Header source language",
    id: "gZjFsvipta",
    description: "TMX source language field label",
  },
  unknown: {
    defaultMessage: "Unavailable",
    id: "Sn0MLFFmg1",
    description: "Fallback for unavailable import metadata",
  },
  systemActor: {
    defaultMessage: "System",
    id: "pPyFwoj/go",
    description: "Fallback import actor",
  },
  running: {
    defaultMessage: "Running",
    id: "F/lm8Q5OV6",
    description: "Running import status",
  },
  completed: {
    defaultMessage: "Completed",
    id: "xwmd6KI0M4",
    description: "Completed import status",
  },
  partiallySuccessful: {
    defaultMessage: "Partially successful",
    id: "rvJbNb+B4a",
    description: "Partially successful import status",
  },
  failed: {
    defaultMessage: "Failed",
    id: "B7F4I10QjV",
    description: "Failed import status",
  },
  totalRead: {
    defaultMessage: "Units read",
    id: "9fd2S51TS6",
    description: "Import units read count",
  },
  created: {
    defaultMessage: "Created",
    id: "FXDqvAOc70",
    description: "Import created count",
  },
  updated: {
    defaultMessage: "Updated",
    id: "eu41qAod0a",
    description: "Import updated count",
  },
  variants: {
    defaultMessage: "Variants",
    id: "D/bMrb96o1",
    description: "Import variants count",
  },
  skipped: {
    defaultMessage: "Skipped",
    id: "X2g46WENkC",
    description: "Import skipped count",
  },
  warnings: {
    defaultMessage: "Warnings",
    id: "JZBASZ6jBY",
    description: "Import warning count",
  },
  failedCount: {
    defaultMessage: "Failed",
    id: "2FJ39S/f6p",
    description: "Import failed count",
  },
  pendingCounts: {
    defaultMessage: "Counts will appear when the import finishes.",
    id: "jhLLn9eNRX",
    description: "Message while import counts are unavailable",
  },
  noDiagnostics: {
    defaultMessage: "No diagnostics were recorded for this import.",
    id: "aOX2RX5VUD",
    description: "Message when an import has no diagnostics",
  },
  diagnosticsExpiredTitle: {
    defaultMessage: "Diagnostics are no longer available",
    id: "nf1dYK5Obp",
    description: "Expired import diagnostics title",
  },
  diagnosticsExpiredDescription: {
    defaultMessage: "Summary counts and import metadata remain available.",
    id: "/DcDBSwhiD",
    description: "Expired import diagnostics explanation",
  },
  diagnosticsTruncatedTitle: {
    defaultMessage: "Diagnostics truncated",
    id: "bFPuquyHxu",
    description: "Truncated import diagnostics title",
  },
  diagnosticsTruncatedDescription: {
    defaultMessage: "Only the retained diagnostic subset is shown.",
    id: "WLgh/s7xnt",
    description: "Truncated import diagnostics explanation",
  },
  diagnosticUnit: {
    defaultMessage: "Unit {unit, number}",
    id: "Nfp+W4SY/c",
    description: "Import diagnostic unit index",
  },
});
