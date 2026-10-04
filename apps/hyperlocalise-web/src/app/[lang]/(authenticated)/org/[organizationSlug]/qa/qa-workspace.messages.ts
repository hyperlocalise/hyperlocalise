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
  failedProjects: {
    defaultMessage:
      "{count, plural, one {# project needs attention} other {# projects need attention}}",
    id: "u1raYxKQQZ",
    description: "Workspace QA count of projects with failed latest scans",
  },
  failedProjectsHelp: {
    defaultMessage:
      "Their latest scans failed. Findings below are from earlier completed scans, when available.",
    id: "dVR1znH0/p",
    description: "Workspace QA stale finding explanation",
  },
  reviewProjects: {
    defaultMessage: "Review projects",
    id: "TCrPfIJsvP",
    description: "Workspace QA action to view failed projects",
  },
  selectedProjectFailed: {
    defaultMessage:
      "This project's latest scan failed. Findings below are from its last completed scan.",
    id: "u63978WZG7",
    description: "Workspace QA selected project failure freshness",
  },
  empty: {
    defaultMessage: "No native projects yet.",
    id: "h6siz+8bqw",
    description: "Workspace QA empty state",
  },
  openProject: {
    defaultMessage: "Open QA",
    id: "LLpCWroQtR",
    description: "Workspace QA link to a project",
  },
  viewFindings: {
    defaultMessage: "View findings",
    id: "bHXY88TkOe",
    description: "Workspace QA action to filter findings to one project",
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
  projectsMetric: {
    defaultMessage: "Projects scanned",
    id: "1ypof61znu",
    description: "Workspace QA metric label for projects whose latest scan completed",
  },
  projectsScannedValue: {
    defaultMessage: "{scanned} of {total}",
    id: "0eBwazbNJY",
    description: "Workspace QA count of scanned projects out of all native projects",
  },
  acrossProjects: {
    defaultMessage: "Across {count, plural, one {# scanned project} other {# scanned projects}}",
    id: "CGTBa8RUXl",
    description: "Workspace QA metric detail naming how many projects the totals cover",
  },
  latestScansDetail: {
    defaultMessage: "From each project’s latest completed scan",
    id: "9y+XnFTl5s",
    description: "Workspace QA metric detail explaining where translation counts come from",
  },
  allProjectsScanned: {
    defaultMessage: "Every project has a completed scan",
    id: "r8Vl8uDYdv",
    description: "Workspace QA metric detail when all projects are scanned",
  },
  stateFailed: {
    defaultMessage: "{count} failed",
    id: "hKPqpZwImM",
    description: "Workspace QA count of projects whose latest scan failed",
  },
  stateRunning: {
    defaultMessage: "{count} in progress",
    id: "7pIitLnb8n",
    description: "Workspace QA count of projects with a scan in progress",
  },
  stateNotScanned: {
    defaultMessage: "{count} not scanned",
    id: "B0ISyUzO3h",
    description: "Workspace QA count of projects that were never scanned",
  },
  byProjectTitle: {
    defaultMessage: "Errors and warnings by project",
    id: "TOiXUpVFsO",
    description: "Workspace QA chart title for errors and warnings per project",
  },
  chartHint: {
    defaultMessage: "Select a bar to filter the findings below.",
    id: "rgfO40Efmv",
    description: "Workspace QA hint that chart bars filter the findings list",
  },
  chartEmpty: {
    defaultMessage: "No findings in the latest completed scans.",
    id: "Fnuknw5/27",
    description: "Workspace QA chart empty state",
  },
});
