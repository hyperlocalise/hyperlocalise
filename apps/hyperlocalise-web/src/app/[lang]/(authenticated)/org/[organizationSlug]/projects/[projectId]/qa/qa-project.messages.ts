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
    id: "TaVUffauIB",
    description: "Project QA page title",
  },
  description: {
    defaultMessage:
      "Background checks for empty targets, same-as-source copy, placeholders, length, and glossary terms.",
    id: "saH2j0ya2P",
    description: "Project QA page description",
  },
  run: {
    defaultMessage: "Run QA check",
    id: "i/EBft9uxG",
    description: "Project QA run button",
  },
  running: {
    defaultMessage: "Running…",
    id: "Xe3fwkVyh6",
    description: "Project QA run in progress",
  },
  schedule: {
    defaultMessage: "Daily scan",
    id: "k+eA3j0O+p",
    description: "Project QA daily schedule toggle",
  },
  scheduleHelp: {
    defaultMessage: "Scan this project once a day when translations change overnight.",
    id: "uZalLkwS55",
    description: "Project QA schedule help",
  },
  unsupported: {
    defaultMessage: "QA reports run on native projects. Provider jobs are not scanned here.",
    id: "m8NpAC200k",
    description: "Project QA unsupported provider message",
  },
  empty: {
    defaultMessage: "No scan yet. Run a QA check to list translation issues.",
    id: "5pj50ZtP7a",
    description: "Project QA empty state",
  },
  noFindings: {
    defaultMessage: "No issues in this scan.",
    id: "mfdI/BnSCm",
    description: "Project QA zero findings",
  },
  segments: {
    defaultMessage: "Segments scanned",
    id: "0tbfPe4rk/",
    description: "Project QA segment count label",
  },
  errors: {
    defaultMessage: "Errors",
    id: "qz4n/WYI/r",
    description: "Project QA error count label",
  },
  warnings: {
    defaultMessage: "Warnings",
    id: "0A0B8c6FRK",
    description: "Project QA warning count label",
  },
  lastRun: {
    defaultMessage: "Last run",
    id: "m645TvmZkL",
    description: "Project QA last run label",
  },
  locale: {
    defaultMessage: "Locale",
    id: "nBr337kZJ1",
    description: "Project QA locale filter",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "adTqYP7Vjb",
    description: "Project QA all locales filter",
  },
  check: {
    defaultMessage: "Check",
    id: "4u1PmCjhti",
    description: "Project QA check type column",
  },
  allChecks: {
    defaultMessage: "All checks",
    id: "xQDNaOICNp",
    description: "Project QA all checks filter",
  },
  key: {
    defaultMessage: "Key",
    id: "bnIBIPeVFP",
    description: "Project QA key column",
  },
  source: {
    defaultMessage: "Source",
    id: "X+udgIpkfB",
    description: "Project QA source column",
  },
  target: {
    defaultMessage: "Target",
    id: "+teevJ7asc",
    description: "Project QA target column",
  },
  openEditor: {
    defaultMessage: "Open in editor",
    id: "M8XELItknC",
    description: "Project QA finding editor link",
  },
  loadError: {
    defaultMessage: "Could not load QA reports.",
    id: "RRjkhCG4Cs",
    description: "Project QA load error",
  },
  runError: {
    defaultMessage: "Could not start the QA scan.",
    id: "KxDSgHEwlN",
    description: "Project QA run error",
  },
  runStarted: {
    defaultMessage: "QA scan finished.",
    id: "fP2RXO/6QV",
    description: "Project QA run success toast",
  },
  scheduleSaved: {
    defaultMessage: "Schedule updated.",
    id: "AgRRIfivV1",
    description: "Project QA schedule save toast",
  },
  history: {
    defaultMessage: "Recent scans",
    id: "CxIXwEUku/",
    description: "Project QA run history heading",
  },
  triggerManual: {
    defaultMessage: "Manual",
    id: "y430vZKHp5",
    description: "Project QA manual trigger label",
  },
  triggerScheduled: {
    defaultMessage: "Scheduled",
    id: "uXvES3jNQD",
    description: "Project QA scheduled trigger label",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "qaPrLoadMore01",
    description: "Project QA load more findings",
  },
  loadingMore: {
    defaultMessage: "Loading…",
    id: "qaPrLoadMore02",
    description: "Project QA loading more findings",
  },
  findingsShown: {
    defaultMessage: "Showing {shown} of {total}",
    id: "qaPrShown01",
    description: "Project QA findings pagination count",
  },
});
