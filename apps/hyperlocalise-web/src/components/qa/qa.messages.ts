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
export const qaMessages = defineMessages({
  findings: {
    defaultMessage: "Findings",
    description: "QA review: findings",
    id: "meBWKk/KIT",
  },
  settings: {
    defaultMessage: "Check settings",
    description: "QA review: settings",
    id: "7mkm3YXe+D",
  },
  history: {
    defaultMessage: "History",
    description: "QA review: history",
    id: "JAa3u44Ff3",
  },
  projects: {
    defaultMessage: "Projects",
    description: "QA review: projects",
    id: "Wo7BO2CWj+",
  },
  language: {
    defaultMessage: "Language",
    description: "QA review: language",
    id: "Zl5aU8sAfv",
  },
  check: { defaultMessage: "Check", description: "QA review: check", id: "B/1vDLGgys" },
  severity: {
    defaultMessage: "Severity",
    description: "QA review: severity",
    id: "YYD0d/Eree",
  },
  status: {
    defaultMessage: "Review status",
    description: "QA review: status",
    id: "K5SlyYYy6s",
  },
  all: { defaultMessage: "All", description: "QA review: all", id: "tlfeFkqvA8" },
  open: { defaultMessage: "Open", description: "QA review: open", id: "2SMlb/eaxa" },
  ignored: {
    defaultMessage: "Ignored",
    description: "QA review: ignored",
    id: "rK4mJieBAr",
  },
  resolved: {
    defaultMessage: "Fixed",
    description: "QA review: resolved",
    id: "ACTAy3p5p3",
  },
  error: { defaultMessage: "Error", description: "QA review: error", id: "UgpzwX+27K" },
  warning: {
    defaultMessage: "Warning",
    description: "QA review: warning",
    id: "yV7FDK28Bk",
  },
  retry: { defaultMessage: "Retry", description: "QA review: retry", id: "z9/avTRfh4" },
  loading: {
    defaultMessage: "Loading QA results\u2026",
    description: "QA review: loading",
    id: "mvMvqeOkdF",
  },
  loadError: {
    defaultMessage: "Could not load QA results. Retry to see the current state.",
    description: "QA review: loadError",
    id: "afqH1Griyu",
  },
  scanFailed: {
    defaultMessage: "QA scan failed",
    description: "QA scan failure heading",
    id: "GhoCtaHiLJ",
  },
  failureQueue: {
    defaultMessage: "The scan could not start.",
    description: "QA scan could not be queued",
    id: "xA3NbKiPOV",
  },
  failureStale: {
    defaultMessage: "The scan stopped responding before it finished.",
    description: "QA scan timed out",
    id: "WBb1kW3Nz2",
  },
  failureProcessing: {
    defaultMessage: "The scan stopped while checking translations.",
    description: "QA scan processing failed",
    id: "dhHPq13vex",
  },
  failureFinalization: {
    defaultMessage: "The checks finished, but the report could not be saved.",
    description: "QA report finalization failed",
    id: "PS2MuzEKTM",
  },
  failureUnknown: {
    defaultMessage: "The scan stopped unexpectedly.",
    description: "QA scan failure with no classified cause",
    id: "nkRTkzumcl",
  },
  failedNoResults: {
    defaultMessage: "No findings from this run are available.",
    description: "QA scan failure result availability",
    id: "/JNYEjMNVT",
  },
  lastCompleted: {
    defaultMessage: "Last completed scan: {date}",
    description: "QA last successful scan timestamp",
    id: "09yHr1a3dj",
  },
  completedScanAt: {
    defaultMessage: "Completed scan: {date}",
    description: "QA finding scan date",
    id: "CAjTa5Br2o",
  },
  attemptedAt: {
    defaultMessage: "Attempted",
    description: "QA run attempted time label",
    id: "PslOM8EEdU",
  },
  trigger: {
    defaultMessage: "Started by",
    description: "QA run trigger label",
    id: "im+pFp1kIC",
  },
  triggerManual: {
    defaultMessage: "A member",
    description: "QA manual run trigger",
    id: "OhDSK13yKr",
  },
  triggerScheduled: {
    defaultMessage: "Daily schedule",
    description: "QA scheduled run trigger",
    id: "w3VOiHT94r",
  },
  retryScan: {
    defaultMessage: "Retry scan",
    description: "QA retry failed scan button",
    id: "OdGJtDZ6jQ",
  },
  technicalDetails: {
    defaultMessage: "Technical details",
    description: "QA failure diagnostic disclosure",
    id: "bAkdHjBiWF",
  },
  failureCode: {
    defaultMessage: "Failure code",
    description: "QA failure code label",
    id: "59CKJeZUxb",
  },
  runId: {
    defaultMessage: "Run ID",
    description: "QA run ID label",
    id: "obN/tl+Sdr",
  },
  copyRunId: {
    defaultMessage: "Copy run ID",
    description: "QA copy run ID action",
    id: "G73Dfp2P/t",
  },
  copiedRunId: {
    defaultMessage: "Copied",
    description: "QA run ID copy confirmation",
    id: "mGopK1fIld",
  },
  copyRunIdFailed: {
    defaultMessage: "Could not copy. Select the run ID instead.",
    description: "QA run ID copy failure",
    id: "kxPNFiSAfY",
  },
  viewFailure: {
    defaultMessage: "View failure",
    description: "QA run history action to inspect failure",
    id: "mTsK/KrTgC",
  },
  viewStatus: {
    defaultMessage: "View status",
    description: "QA run history action to inspect running scan",
    id: "Z8iMQbn2KB",
  },
  running: {
    defaultMessage: "Checking translations\u2026 Results will refresh when the scan finishes.",
    description: "QA review: running",
    id: "vMChOzfTNJ",
  },
  clean: {
    defaultMessage: "No issues found by the completed checks.",
    description: "QA review: clean",
    id: "u3BZBQaICF",
  },
  noMatches: {
    defaultMessage: "No findings match these filters.",
    description: "QA review: noMatches",
    id: "zf1lo4S0vz",
  },
  notScanned: {
    defaultMessage: "Not checked yet. Run a scan to review translation quality.",
    description: "QA review: notScanned",
    id: "cgdeN4r2SO",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    description: "QA review: clearFilters",
    id: "+N01w67gWu",
  },
  review: {
    defaultMessage: "Review translation",
    description: "QA review: review",
    id: "STIEPg13ap",
  },
  ignore: { defaultMessage: "Ignore", description: "QA review: ignore", id: "H1kAb9fqeL" },
  undo: { defaultMessage: "Reopen finding", description: "QA review: undo", id: "JmcxiTldDn" },
  reason: {
    defaultMessage: "Reason for ignoring",
    description: "QA review: reason",
    id: "+5xuW3RZ6g",
  },
  ignoreHelp: {
    defaultMessage:
      "Applies only to this translation and check. Changes to the text or check will require review again.",
    description: "QA review: ignoreHelp",
    id: "7bsA3fdcWa",
  },
  saveIgnore: {
    defaultMessage: "Ignore finding",
    description: "QA review: saveIgnore",
    id: "w+R782P14M",
  },
  cancel: { defaultMessage: "Cancel", description: "QA review: cancel", id: "HiDbEs7qe/" },
  reviewError: {
    defaultMessage: "Could not update this finding. Please retry.",
    description: "QA review: reviewError",
    id: "toROT17dSP",
  },
  needsRecheck: {
    defaultMessage: "Translation changed \u2014 run a scan to recheck.",
    description: "QA review: needsRecheck",
    id: "P3c/gqRJ32",
  },
  snapshot: {
    defaultMessage:
      "Results are from the selected scan. After editing translations, run a scan to verify fixes.",
    description: "QA review: snapshot",
    id: "ddiUpCdAfL",
  },
  coverage: {
    defaultMessage: "Checks included",
    description: "QA review: coverage",
    id: "rC0aFF7mAf",
  },
  coverageHelp: {
    defaultMessage:
      "Scans and the editor use the same format, placeholder, ICU, length, spelling and glossary checks. Errors and warnings are review signals; this page does not block saving.",
    description: "QA review: coverageHelp",
    id: "cQS/FkQnVB",
  },
  legacy: {
    defaultMessage:
      "This older scan used a limited set of checks. Run a new scan for full coverage.",
    description: "QA review: legacy",
    id: "dhvOiSCT+a",
  },
  skipped: {
    defaultMessage:
      "Some checks were unavailable: {checks}. A clean result does not cover these checks.",
    description: "QA review: skipped",
    id: "PPy4H0Z9Eo",
  },
  summary: {
    defaultMessage:
      "{segments} translations checked \u00b7 {errors} errors \u00b7 {warnings} warnings",
    description: "QA review: summary",
    id: "e0sPtLxq8D",
  },
  lastChecked: {
    defaultMessage: "Checked {date}",
    description: "QA review: lastChecked",
    id: "d0cLHpPv5k",
  },
  showWhitespace: {
    defaultMessage: "Show spaces and line breaks",
    description: "QA review: showWhitespace",
    id: "ffIGEm5KON",
  },
  source: { defaultMessage: "Source", description: "QA review: source", id: "dHRuF7Xzja" },
  target: {
    defaultMessage: "Translation",
    description: "QA review: target",
    id: "F4ydZZnW5B",
  },
  emptyText: {
    defaultMessage: "Empty translation",
    description: "QA review: emptyText",
    id: "9S+GXjvIOY",
  },
  createIssue: {
    defaultMessage: "Create issue",
    description: "QA review: createIssue",
    id: "zYh5CWtAcg",
  },
  select: {
    defaultMessage: "Select {key}, {locale}, {check}",
    description: "QA review: select",
    id: "xqyGtroaKn",
  },
  selectLoaded: {
    defaultMessage: "Select loaded open findings",
    description: "QA review: selectLoaded",
    id: "ycpTXfqEM8",
  },
  createSelected: {
    defaultMessage: "Create issues ({count})",
    description: "QA review: createSelected",
    id: "Ssa7/hGE3u",
  },
  more: { defaultMessage: "Load more", description: "QA review: more", id: "2jbudFIi5U" },
  shown: {
    defaultMessage: "Showing {shown} of {total} findings",
    description: "QA review: shown",
    id: "ng0CwrjdqN",
  },
  scheduleError: {
    defaultMessage: "Could not update the schedule. Retry the change.",
    description: "QA review: scheduleError",
    id: "TafKpm43IW",
  },
  not_localized: {
    defaultMessage: "Missing translation",
    description: "QA review: not_localized",
    id: "lm8uSjSdQw",
  },
  whitespace_only: {
    defaultMessage: "Only spaces",
    description: "QA review: whitespace_only",
    id: "9yRXgOt/A2",
  },
  same_as_source: {
    defaultMessage: "Same as source",
    description: "QA review: same_as_source",
    id: "YI9x5RF2V6",
  },
  escaped_char_mismatch: {
    defaultMessage: "Unexpected escape characters",
    description: "QA review: escaped_char_mismatch",
    id: "VDEy+gyPQ0",
  },
  length: {
    defaultMessage: "Character limit exceeded",
    description: "QA review: length",
    id: "T1n1qJt8t+",
  },
  placeholder_mismatch: {
    defaultMessage: "Placeholder mismatch",
    description: "QA review: placeholder_mismatch",
    id: "Z2Ck8nRIGO",
  },
  glossary_violation: {
    defaultMessage: "Glossary terminology",
    description: "QA review: glossary_violation",
    id: "F112ZDElyz",
  },
  format: {
    defaultMessage: "Format, tags & ICU",
    description: "QA review: format",
    id: "dJR/duuZmP",
  },
  spelling: {
    defaultMessage: "Spelling",
    description: "QA review: spelling",
    id: "pdJV+o9lWH",
  },
  numbers_mismatch: {
    defaultMessage: "Numbers",
    description: "QA review: numbers mismatch",
    id: "55pv/fQdGW",
  },
  punctuation_mismatch: {
    defaultMessage: "Ending punctuation",
    description: "QA review: punctuation mismatch",
    id: "KMCkdidgwq",
  },
  character_case_mismatch: {
    defaultMessage: "Capitalization",
    description: "QA review: character case mismatch",
    id: "0RJcnzvDSO",
  },
  enableCheck: {
    defaultMessage: "Enable {check}",
    description: "Enable translation QA check",
    id: "QJstPBKp4K",
  },
  savePolicy: {
    defaultMessage: "Save check settings",
    description: "Save QA policy",
    id: "oayHNZPeA1",
  },
  policySaved: {
    defaultMessage: "Check settings saved. Run a new scan to apply them to existing translations.",
    description: "QA policy saved",
    id: "cJkL1hLn1z",
  },
  policyError: {
    defaultMessage: "Could not save check settings. Retry the change.",
    description: "QA policy save error",
    id: "m4ICmbhsyP",
  },
  warningBehavior: {
    defaultMessage: "Warning: show the issue and allow saving.",
    description: "QA warning behavior",
    id: "UTk9vb74bY",
  },
  errorBehavior: {
    defaultMessage: "Error: resolve the issue before saving or approving.",
    description: "QA error behavior",
    id: "lTJVZLlOrt",
  },
  older: {
    defaultMessage: "Viewing an older scan. Open the latest scan to review current findings.",
    description: "QA review: older",
    id: "ZZvftz3AeK",
  },
  latest: {
    defaultMessage: "View latest scan",
    description: "QA review: latest",
    id: "4yF6F+4xzc",
  },
  workspaceHelp: {
    defaultMessage:
      "Review findings from each project's last completed scan. A newer failed scan does not refresh them.",
    description: "QA review: workspaceHelp",
    id: "FCD/KpD+4M",
  },
  linkedIssue: {
    defaultMessage: "Issue {identifier}",
    description: "QA review: linkedIssue",
    id: "8FIj+RZsTt",
  },
});
