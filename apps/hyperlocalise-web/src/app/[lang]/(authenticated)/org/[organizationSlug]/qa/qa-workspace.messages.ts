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
    id: "qaWsTitle01",
    description: "Workspace QA page title",
  },
  description: {
    defaultMessage: "Latest native project scans. Run a check from a project to populate this list.",
    id: "qaWsDesc01",
    description: "Workspace QA page description",
  },
  empty: {
    defaultMessage: "No native projects yet.",
    id: "qaWsEmpty01",
    description: "Workspace QA empty state",
  },
  neverRun: {
    defaultMessage: "Not scanned",
    id: "qaWsNever01",
    description: "Workspace QA when a project has no scan",
  },
  findings: {
    defaultMessage: "{count, plural, one {# issue} other {# issues}}",
    id: "qaWsFind01",
    description: "Workspace QA finding count",
  },
  openProject: {
    defaultMessage: "Open QA",
    id: "qaWsOpen01",
    description: "Workspace QA link to a project",
  },
  daily: {
    defaultMessage: "Daily",
    id: "qaWsDaily01",
    description: "Workspace QA daily cadence label",
  },
  manual: {
    defaultMessage: "Manual",
    id: "qaWsMan01",
    description: "Workspace QA manual cadence label",
  },
  loadError: {
    defaultMessage: "Could not load QA reports.",
    id: "qaWsErr01",
    description: "Workspace QA load error",
  },
  lastRun: {
    defaultMessage: "Last scan {date}",
    id: "qaWsLast01",
    description: "Workspace QA last scan timestamp",
  },
  counts: {
    defaultMessage: "{errors} errors · {warnings} warnings",
    id: "qaWsCnt01",
    description: "Workspace QA error and warning counts",
  },
});
