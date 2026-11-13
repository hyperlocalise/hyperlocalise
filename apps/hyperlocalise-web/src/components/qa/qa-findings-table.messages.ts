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

export const qaFindingsTableMessages = defineMessages({
  project: {
    defaultMessage: "Project",
    id: "gIYL8jZILC",
    description: "QA findings table project column",
  },
  key: {
    defaultMessage: "Key",
    id: "5w2ioj6keh",
    description: "QA findings table key column",
  },
  locale: {
    defaultMessage: "Locale",
    id: "D6zHBNwwDM",
    description: "QA findings table locale column",
  },
  check: {
    defaultMessage: "Check",
    id: "zJxOt74NmI",
    description: "QA findings table check column",
  },
  source: {
    defaultMessage: "Source",
    id: "HP7ss/8W6n",
    description: "QA findings table source column",
  },
  target: {
    defaultMessage: "Target",
    id: "m5kE+dCKKR",
    description: "QA findings table target column",
  },
  openEditor: {
    defaultMessage: "Open editor",
    id: "i6eUIFDSYw",
    description: "QA findings open editor action",
  },
  selectAll: {
    defaultMessage: "Select all findings on this page",
    id: "iTVR7wwaLD",
    description: "QA findings select all checkbox label",
  },
  createIssues: {
    defaultMessage:
      "{count, plural, =0 {Create issues} one {Create # issue} other {Create # issues}}",
    id: "odbevaPvBa",
    description: "Create issues from selected QA findings",
  },
  createIssuesPage: {
    defaultMessage: "Create issues for this page",
    id: "a/ZzE1agR3",
    description: "Create issues for all findings on the current page",
  },
  promoteSuccess: {
    defaultMessage: "Created {created, plural, one {# issue} other {# issues}} · linked {linked}",
    id: "bqq6gG/5A4",
    description: "Toast after promoting QA findings to issues",
  },
  promoteError: {
    defaultMessage: "Could not create issues from findings.",
    id: "hQ6Smvxtjf",
    description: "Error promoting QA findings to issues",
  },
  shown: {
    defaultMessage: "Showing {shown} of {total}",
    id: "a6Zh+I8dIP",
    description: "QA findings pagination summary",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "xW6J7GYSs6",
    description: "Load more QA findings",
  },
  loadingMore: {
    defaultMessage: "Loading…",
    id: "p61/Ym5Dcy",
    description: "Loading more QA findings",
  },
});
