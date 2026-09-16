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

export const qaWorkspaceMessages = defineMessages({
  title: {
    defaultMessage: "Translation QA",
    id: "6PydP1CR24",
    description: "Workspace QA page title",
  },
  description: {
    defaultMessage:
      "Portfolio health from the latest scans, plus a cross-project queue to fix findings.",
    id: "qWfE0C4hqC",
    description: "Workspace QA page description",
  },
  portfolioTitle: {
    defaultMessage: "Portfolio",
    id: "zJnpLjNSBd",
    description: "Workspace QA portfolio section title",
  },
  findingsQueueTitle: {
    defaultMessage: "Latest findings",
    id: "Vd9EBpnVTy",
    description: "Workspace QA org-wide findings section title",
  },
  findingsQueueDescription: {
    defaultMessage:
      "From each project's latest successful scan. Create issues to triage in the Issues board.",
    id: "ekMwmzyaxe",
    description: "Workspace QA org-wide findings section description",
  },
  allProjects: {
    defaultMessage: "All projects",
    id: "lR7pNsCeCh",
    description: "Workspace QA project filter option",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "QBKNeR9yId",
    description: "Workspace QA locale filter option",
  },
  allChecks: {
    defaultMessage: "All checks",
    id: "jogbp5WUAz",
    description: "Workspace QA check type filter option",
  },
  noFindings: {
    defaultMessage: "No findings match these filters.",
    id: "fCRbJ9qc0i",
    description: "Workspace QA empty findings queue",
  },
  empty: {
    defaultMessage: "No native projects yet.",
    id: "h6siz+8bqw",
    description: "Workspace QA empty state",
  },
  neverRun: {
    defaultMessage: "Not scanned",
    id: "coLjATj12b",
    description: "Workspace QA when a project has no scan",
  },
  failed: {
    defaultMessage: "Last scan failed",
    id: "YNnCNeuDLL",
    description: "Workspace QA when the latest scan failed",
  },
  running: {
    defaultMessage: "Scan in progress",
    id: "xQT8yHFRak",
    description: "Workspace QA when a scan is still running",
  },
  findings: {
    defaultMessage: "{count, plural, one {# issue} other {# issues}}",
    id: "Z2biIz/+mo",
    description: "Workspace QA finding count",
  },
  openProject: {
    defaultMessage: "Open QA",
    id: "LLpCWroQtR",
    description: "Workspace QA link to a project",
  },
  daily: {
    defaultMessage: "Daily",
    id: "8AjMtlrawH",
    description: "Workspace QA daily cadence label",
  },
  manual: {
    defaultMessage: "Manual",
    id: "hN4fiihgrQ",
    description: "Workspace QA manual cadence label",
  },
  loadError: {
    defaultMessage: "Could not load QA reports.",
    id: "9hOQ1Cn/qy",
    description: "Workspace QA load error",
  },
  lastRun: {
    defaultMessage: "Last scan {date}",
    id: "MwgUCiCSez",
    description: "Workspace QA last scan timestamp",
  },
  counts: {
    defaultMessage: "{errors} errors · {warnings} warnings",
    id: "RwdjBGDnCb",
    description: "Workspace QA error and warning counts",
  },
});
