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

export const qaProjectMessages = defineMessages({
  title: {
    defaultMessage: "Translation QA",
    id: "qaPrTitle01",
    description: "Project QA page title",
  },
  description: {
    defaultMessage:
      "Background checks for empty targets, same-as-source copy, placeholders, length, and glossary terms.",
    id: "qaPrDesc01",
    description: "Project QA page description",
  },
  run: {
    defaultMessage: "Run QA check",
    id: "qaPrRun01",
    description: "Project QA run button",
  },
  running: {
    defaultMessage: "Running…",
    id: "qaPrRunn01",
    description: "Project QA run in progress",
  },
  schedule: {
    defaultMessage: "Daily scan",
    id: "qaPrSch01",
    description: "Project QA daily schedule toggle",
  },
  scheduleHelp: {
    defaultMessage: "Scan this project once a day when translations change overnight.",
    id: "qaPrSchH01",
    description: "Project QA schedule help",
  },
  unsupported: {
    defaultMessage: "QA reports run on native projects. Provider jobs are not scanned here.",
    id: "qaPrUnsup01",
    description: "Project QA unsupported provider message",
  },
  empty: {
    defaultMessage: "No scan yet. Run a QA check to list translation issues.",
    id: "qaPrEmpty01",
    description: "Project QA empty state",
  },
  noFindings: {
    defaultMessage: "No issues in this scan.",
    id: "qaPrNone01",
    description: "Project QA zero findings",
  },
  segments: {
    defaultMessage: "Segments scanned",
    id: "qaPrSeg01",
    description: "Project QA segment count label",
  },
  errors: {
    defaultMessage: "Errors",
    id: "qaPrErrC01",
    description: "Project QA error count label",
  },
  warnings: {
    defaultMessage: "Warnings",
    id: "qaPrWarn01",
    description: "Project QA warning count label",
  },
  lastRun: {
    defaultMessage: "Last run",
    id: "qaPrLast01",
    description: "Project QA last run label",
  },
  locale: {
    defaultMessage: "Locale",
    id: "qaPrLoc01",
    description: "Project QA locale filter",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "qaPrAllL01",
    description: "Project QA all locales filter",
  },
  check: {
    defaultMessage: "Check",
    id: "qaPrChk01",
    description: "Project QA check type column",
  },
  allChecks: {
    defaultMessage: "All checks",
    id: "qaPrAllC01",
    description: "Project QA all checks filter",
  },
  key: {
    defaultMessage: "Key",
    id: "qaPrKey01",
    description: "Project QA key column",
  },
  source: {
    defaultMessage: "Source",
    id: "qaPrSrc01",
    description: "Project QA source column",
  },
  target: {
    defaultMessage: "Target",
    id: "qaPrTgt01",
    description: "Project QA target column",
  },
  openEditor: {
    defaultMessage: "Open in editor",
    id: "qaPrOpen01",
    description: "Project QA finding editor link",
  },
  loadError: {
    defaultMessage: "Could not load QA reports.",
    id: "qaPrLoad01",
    description: "Project QA load error",
  },
  runError: {
    defaultMessage: "Could not start the QA scan.",
    id: "qaPrRunE01",
    description: "Project QA run error",
  },
  runStarted: {
    defaultMessage: "QA scan finished.",
    id: "qaPrDone01",
    description: "Project QA run success toast",
  },
  scheduleSaved: {
    defaultMessage: "Schedule updated.",
    id: "qaPrSav01",
    description: "Project QA schedule save toast",
  },
  history: {
    defaultMessage: "Recent scans",
    id: "qaPrHist01",
    description: "Project QA run history heading",
  },
  triggerManual: {
    defaultMessage: "Manual",
    id: "qaPrTrigM01",
    description: "Project QA manual trigger label",
  },
  triggerScheduled: {
    defaultMessage: "Scheduled",
    id: "qaPrTrigS01",
    description: "Project QA scheduled trigger label",
  },
});
