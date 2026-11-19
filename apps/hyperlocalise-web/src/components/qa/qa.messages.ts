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
  review: {
    defaultMessage: "Fix in editor",
    description: "QA review: open the translation in the editor to fix the finding",
    id: "q04Mtm8DKj",
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
      "Scans and the editor use the same format, placeholder, ICU, length, spelling, glossary and guideline checks. Warnings flag an issue; errors also block saving and approving in the editor.",
    description: "QA review: coverageHelp",
    id: "tkvPfaR9Sq",
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
  summarySegments: {
    defaultMessage: "{count, plural, one {# translation checked} other {# translations checked}}",
    description: "QA run summary: translations checked",
    id: "Pe+3P3L4Pm",
  },
  summaryErrors: {
    defaultMessage: "{count, plural, one {# error} other {# errors}}",
    description: "QA run summary: error count",
    id: "RTRiDZLUer",
  },
  summaryWarnings: {
    defaultMessage: "{count, plural, one {# warning} other {# warnings}}",
    description: "QA run summary: warning count",
    id: "Hf4qHC8Sxe",
  },
  lastChecked: {
    defaultMessage: "Checked {date}",
    description: "QA review: lastChecked",
    id: "d0cLHpPv5k",
  },
  showWhitespace: {
    defaultMessage: "Show spaces",
    description: "QA finding card action to show spaces, tabs and line breaks as markers",
    id: "iP04ulaRdB",
  },
  nbsp: {
    defaultMessage: "Non-breaking space",
    description: "QA review: visible non-breaking space mark",
    id: "0JaRog7D2n",
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
  unreachable_plural_case: {
    defaultMessage: "Unreachable plural case",
    description: "QA review: unreachable_plural_case",
    id: "0aZjyrf1Pz",
  },
  guideline: {
    defaultMessage: "Guidelines",
    description: "QA review: guideline check that runs in the editor and in project scans",
    id: "igEEUV9KY8",
  },
  guidelineCheckHelp: {
    defaultMessage:
      "Checked in the editor while you translate and in project QA scans when enabled. Warnings do not block saving. An error asks the translator to confirm before saving when the editor has already reported it. Each check counts toward your weekly guideline allowance; a cache hit is not billed. A flagged row stays a short warning until you choose Explain, which spends AI credit. If a scan hits the allowance, skips a translation that is too long to check, or the checker stops, it keeps findings it already saved, leaves older guideline findings open, and notes that guideline checks were incomplete.",
    description: "Help for the guideline QA check in the editor and scans",
    id: "qkcs2YRJiN",
  },
  explainError: {
    defaultMessage: "Could not explain this finding. Please retry.",
    description: "QA finding card error when on-demand guideline reasoning fails",
    id: "HvCdgmY78G",
  },
  guidelineCheckHalted: {
    defaultMessage:
      "Guideline checks stopped before every translation was reviewed. Findings from this scan are incomplete, and older guideline findings stay open.",
    description: "QA run notice when guideline checks halted mid-scan",
    id: "WaSnm7wizj",
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
    defaultMessage: "Error: ask the translator to confirm before saving or approving.",
    description: "QA error behavior",
    id: "4N+2slujci",
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
  errorsFilter: {
    defaultMessage: "Errors",
    description: "QA findings severity filter option for errors",
    id: "F1mswDK3dN",
  },
  warningsFilter: {
    defaultMessage: "Warnings",
    description: "QA findings severity filter option for warnings",
    id: "/HrhRXll0S",
  },
  filterChip: {
    defaultMessage: "{label}: {value}",
    description: "QA active filter chip, for example Language: de-DE",
    id: "r0PXBuEaOF",
  },
  removeFilter: {
    defaultMessage: "Remove filter {label}: {value}",
    description: "Accessible label for removing one active QA filter",
    id: "EUl/k6hPi8",
  },
  clearAll: {
    defaultMessage: "Clear all",
    description: "QA action to reset every findings filter",
    id: "TSE/OdVs3y",
  },
  resultCount: {
    defaultMessage: "{count, plural, one {# finding} other {# findings}}",
    description: "QA count of findings that match the current filters",
    id: "O3JiAXCVWc",
  },
  selectAllOpen: {
    defaultMessage: "Select all open ({count})",
    description: "QA checkbox label to select every loaded open finding",
    id: "pJZlD9A8hJ",
  },
  selectedCount: {
    defaultMessage: "{count} selected",
    description: "QA count of selected findings in the bulk action bar",
    id: "1E60Au5VY0",
  },
  clearSelection: {
    defaultMessage: "Clear selection",
    description: "QA action to deselect every finding",
    id: "epgqMIB5N1",
  },
  ignoreBecause: {
    defaultMessage: "Ignore because",
    description: "QA ignore menu heading above preset reasons",
    id: "+PjGZL4Kq1",
  },
  ignoreFalsePositive: {
    defaultMessage: "Not a real issue",
    description: "QA preset reason for ignoring a false positive finding",
    id: "EqTEhbXnWU",
  },
  ignoreIntentional: {
    defaultMessage: "Intentional for this market",
    description: "QA preset reason for ignoring a deliberate translation choice",
    id: "xOytcDysjb",
  },
  ignoreBrandTerm: {
    defaultMessage: "Brand or product term",
    description: "QA preset reason for ignoring a brand or product name",
    id: "OYdZN+Q8q4",
  },
  ignoreOther: {
    defaultMessage: "Other reason\u2026",
    description: "QA ignore menu item that asks for a custom reason",
    id: "d8ajNV4LOu",
  },
  needsRecheckBadge: {
    defaultMessage: "Needs recheck",
    description: "QA badge for a finding whose translation changed after the scan",
    id: "CGzpmDlpq3",
  },
  showCharts: {
    defaultMessage: "Show charts",
    description: "QA overview action to expand the breakdown charts",
    id: "QQlco7X5aK",
  },
  hideCharts: {
    defaultMessage: "Hide charts",
    description: "QA overview action to collapse the breakdown charts",
    id: "VEphw4mha8",
  },
  checkOff: {
    defaultMessage: "Off",
    description: "QA settings option that turns a check off",
    id: "c0ch1EgIn0",
  },
  bulkIgnored: {
    defaultMessage: "{count, plural, one {Ignored # finding} other {Ignored # findings}}",
    description: "QA toast after ignoring several findings at once",
    id: "bISSBVAr7c",
  },
  ignoreSelected: {
    defaultMessage: "Ignore ({count})",
    description: "QA bulk action to ignore the selected findings",
    id: "P3DM5+MVCF",
  },
  hideWhitespace: {
    defaultMessage: "Hide spaces",
    description: "QA finding card action to hide whitespace markers",
    id: "Bpacu25hhF",
  },
  runFirstScan: {
    defaultMessage: "Run first scan",
    description: "QA action to start the first scan of a project",
    id: "mBT7UnvJ4o",
  },
});
