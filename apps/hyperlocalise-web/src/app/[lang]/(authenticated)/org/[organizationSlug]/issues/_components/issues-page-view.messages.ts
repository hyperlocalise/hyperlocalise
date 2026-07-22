"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const issuesPageViewMessages = defineMessages({
  summaryTotal: {
    defaultMessage: "{count} total",
    id: "57OPGCpQ8o",
    description: "Badge showing total issue count on the workspace issues page",
  },
  summaryOpen: {
    defaultMessage: "{count} open",
    id: "5wkpaoahQN",
    description: "Badge showing open issue count on the workspace issues page",
  },
  summaryInProgress: {
    defaultMessage: "{count} in progress",
    id: "sK6Zq81Q7Q",
    description: "Badge showing in-progress issue count on the workspace issues page",
  },
  summaryResolved: {
    defaultMessage: "{count} resolved",
    id: "qJxW5aeiQX",
    description: "Badge showing resolved issue count on the workspace issues page",
  },
  loadingSummaryAria: {
    defaultMessage: "Loading issue summary",
    id: "msTgVSwxwv",
    description: "Accessible label while workspace issue summary badges are loading",
  },
  columnIssue: {
    defaultMessage: "Issue",
    id: "eKSgKws5Qq",
    description: "Table column header for the issue title and details",
  },
  columnStatus: {
    defaultMessage: "Status",
    id: "FZR01zQdR+",
    description: "Table column header for issue status",
  },
  columnType: {
    defaultMessage: "Type",
    id: "mG1/3d7d9k",
    description: "Table column header for issue type",
  },
  columnProject: {
    defaultMessage: "Project",
    id: "xI2rMhHb7n",
    description: "Table column header for the project name",
  },
  columnLocale: {
    defaultMessage: "Locale",
    id: "ou63JKkZ6w",
    description: "Table column header for target locale",
  },
  columnUpdated: {
    defaultMessage: "Updated",
    id: "rWXo8jdqPU",
    description: "Table column header for last updated time",
  },
  loadError: {
    defaultMessage: "Issues could not be loaded.",
    id: "Cgi0SFaOp5",
    description: "Error state when workspace issues fail to load",
  },
  empty: {
    defaultMessage: "No issues match this view.",
    id: "rWc6Iosb8n",
    description: "Empty state when the filtered workspace issues list has no rows",
  },
  noDetailsYet: {
    defaultMessage: "No details yet",
    id: "m/76XCOVDx",
    description: "Fallback detail line when an issue has no description or source path",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "pwC137Rvv4",
    description: "Placeholder shown when an issue has no target locale",
  },
  loadingMore: {
    defaultMessage: "Loading...",
    id: "aaZ+fOJPdY",
    description: "Button label while more workspace issues are loading",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "Mb+6tFSPF+",
    description: "Button to load more workspace issues",
  },
});
