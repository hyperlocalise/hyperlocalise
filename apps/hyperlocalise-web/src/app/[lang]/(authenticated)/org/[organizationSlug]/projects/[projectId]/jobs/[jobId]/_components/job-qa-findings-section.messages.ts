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

export const jobQaFindingsSectionMessages = defineMessages({
  threads: {
    defaultMessage: "Threads",
    id: "bOxmqF5fsc",
    description: "Summary chip label for total provider review threads",
  },
  open: {
    defaultMessage: "Open",
    id: "d4k3u/RjlU",
    description: "Summary chip label for open provider review threads",
  },
  resolved: {
    defaultMessage: "Resolved",
    id: "/arLdcgfuq",
    description: "Summary chip label for resolved provider review threads",
  },
  summaryChip: {
    defaultMessage: "{label}: {count}",
    id: "s9KpNEg6/X",
    description: "Summary chip showing a labeled count",
  },
  commentsInThread: {
    defaultMessage:
      "{count, plural, one {# comment in this thread} other {# comments in this thread}}",
    id: "0WjkA7ZIo0",
    description: "Count of comments in a provider review thread",
  },
  viewInProjectFiles: {
    defaultMessage: "View in project files",
    id: "laNyhZRg9B",
    description: "Link from a finding or thread to the project files view",
  },
  openInTms: {
    defaultMessage: "Open in TMS",
    id: "tTUnSeKAeI",
    description: "Link to open a finding or thread in the TMS",
  },
  total: {
    defaultMessage: "Total",
    id: "iOQUj8xk0+",
    description: "QA summary chip label for total findings",
  },
  errors: {
    defaultMessage: "Errors",
    id: "joZ7ICFNXi",
    description: "QA summary chip and filter option for error severity",
  },
  warnings: {
    defaultMessage: "Warnings",
    id: "ky7nZwQbWB",
    description: "QA summary chip and filter option for warning severity",
  },
  info: {
    defaultMessage: "Info",
    id: "hQBuxkw/u1",
    description: "QA summary chip and filter option for info severity",
  },
  findingAlreadyHasComment: {
    defaultMessage: "This finding already has a provider comment",
    id: "ma//E+vGBm",
    description: "Checkbox title when a finding already has a provider comment",
  },
  confidencePercent: {
    defaultMessage: "{percent}% confidence",
    id: "taEyfhF5GT",
    description: "Badge showing QA finding confidence percentage",
  },
  viewProviderComment: {
    defaultMessage: "View provider comment",
    id: "k+thiYGUNH",
    description: "Link to view the posted provider comment for a finding",
  },
  couldNotPostComment: {
    defaultMessage: "Could not post provider comment",
    id: "XMud6JNFWG",
    description: "Inline status when posting a provider comment for a finding failed",
  },
  failedToStartAgentRun: {
    defaultMessage: "Failed to start agent run",
    id: "m7kZYILbyh",
    description: "Toast and error fallback when starting a QA-related agent run fails",
  },
  agentRunQueued: {
    defaultMessage: "Agent run queued",
    id: "nnkQAnt0DC",
    description: "Success toast after queuing a QA-related agent run",
  },
  reviewFindingsHeading: {
    defaultMessage: "Review findings",
    id: "Cjv9CLDaoR",
    description: "Section heading for QA and provider review findings",
  },
  reviewFindingsDescription: {
    defaultMessage:
      "Inspect issues from agent review before writing back to the TMS. Filter by locale or check type, then act on selected findings.",
    id: 'w+PtMk3dhE',
    description: "Description under the review findings section heading",
  },
  selectAtLeastOneFinding: {
    defaultMessage: "Select at least one finding",
    id: "2eSDKs0tvs",
    description: "Tooltip when an action requires selecting findings",
  },
  selectedAlreadyHaveComments: {
    defaultMessage: "Selected findings already have provider comments",
    id: "6AKflqYexI",
    description: "Tooltip when selected findings cannot receive new provider comments",
  },
  commentOnSelected: {
    defaultMessage: "Comment on selected ({count})",
    id: "ywtUG5+uZX",
    description: "Button to leave provider comments on selected findings",
  },
  agentReviewRunning: {
    defaultMessage: "Agent review is running. Results will refresh when the run completes.",
    id: "oiy7DSDLQj",
    description: "Banner while an agent review run is in progress",
  },
  providerReviewThreadsHeading: {
    defaultMessage: "Provider review threads",
    id: "BYP7UvhVPD",
    description: "Heading for synced TMS review threads",
  },
  providerReviewThreadsDescription: {
    defaultMessage: "Issues and comments synced from the TMS for this job.",
    id: "uQrRCHzkA3",
    description: "Description under the provider review threads heading",
  },
  searchPlaceholder: {
    defaultMessage: "Search key, message, or string id",
    id: "2ngWiLidNE",
    description: "Placeholder for the QA findings search field",
  },
  severityPlaceholder: {
    defaultMessage: "Severity",
    id: "312NkWerz6",
    description: "Placeholder for the severity filter select",
  },
  allSeverities: {
    defaultMessage: "All severities",
    id: "HaSFPe1Hc9",
    description: "Option to show findings of all severities",
  },
  localePlaceholder: {
    defaultMessage: "Locale",
    id: "etcfJQbHjR",
    description: "Placeholder for the locale filter select",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "7kqErlPE9+",
    description: "Option to show findings for all locales",
  },
  checkTypePlaceholder: {
    defaultMessage: "Check type",
    id: "NYa08Ow2+o",
    description: "Placeholder for the check type filter select",
  },
  allCheckTypes: {
    defaultMessage: "All check types",
    id: "TKlxwbN5s5",
    description: "Option to show findings of all check types",
  },
  groupByPlaceholder: {
    defaultMessage: "Group by",
    id: "XBvYNdWRjl",
    description: "Placeholder for the findings group-by select",
  },
  groupBySeverity: {
    defaultMessage: "Group by severity",
    id: "0xVoz6BUOo",
    description: "Option to group findings by severity",
  },
  groupByLocale: {
    defaultMessage: "Group by locale",
    id: "rPOhUqloaT",
    description: "Option to group findings by locale",
  },
  groupByCheckType: {
    defaultMessage: "Group by check type",
    id: "5N0h/1bean",
    description: "Option to group findings by check type",
  },
  groupByKey: {
    defaultMessage: "Group by key",
    id: "pIkMyGXYQI",
    description: "Option to group findings by string key",
  },
  showingCount: {
    defaultMessage: "Showing {filteredCount} of {totalCount}",
    id: "YdKOj/qPXN",
    description: "Count of filtered QA findings versus total when no filters are active",
  },
  showingCountWithFilters: {
    defaultMessage:
      "Showing {filteredCount} of {totalCount} · {filtersCount, plural, one {# filter active} other {# filters active}}",
    id: "LEfQSRZ7Vt",
    description: "Count of filtered QA findings versus total when filters are active",
  },
  deselectGroup: {
    defaultMessage: "Deselect group",
    id: "yZjiVhUD/g",
    description: "Button to deselect all findings in a group",
  },
  selectGroup: {
    defaultMessage: "Select group",
    id: "pFlavhBN0y",
    description: "Button to select all findings in a group",
  },
  noFindingsMatchFiltersWithClear: {
    defaultMessage: "No findings match the current filters. <clear>Clear filters</clear>",
    id: "HETvCDj5wB",
    description: "Empty state when filters hide all findings, with a clear-filters action",
  },
  noQaFindingsYetTitle: {
    defaultMessage: "No review findings yet",
    id: 'oJcXaqw3Ec',
    description: "Empty state title when no review report exists yet",
  },
  noQaFindingsYetDescription: {
    defaultMessage:
      "Run an agent review on this TMS job to surface placeholder, ICU, glossary, and translation issues here.",
    id: 'jPKGTMWZ1h',
    description: "Empty state description when no review report exists yet",
  },
  noIssuesFoundTitle: {
    defaultMessage: "No issues found",
    id: "X69pKW667o",
    description: "Empty state title when QA completed with zero findings",
  },
  noIssuesFoundDescription: {
    defaultMessage:
      "The latest QA run completed without findings. Re-run checks after content changes to refresh this view.",
    id: "I1+Lm6XV/X",
    description: "Empty state description when QA completed with zero findings",
  },
});
