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

export const issueSheetPageContentMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Issue Sheet",
    id: "wAvI6goI3/",
    description: "Section title for the project Issue Sheet page",
  },
  sectionDescription: {
    defaultMessage:
      "Track localization issues in Hyperlocalise, then link rows to CAT segments, native issues, provider threads, or external context.",
    id: "fVnq1NHYYK",
    description: "Section description for the project Issue Sheet page",
  },
  importCsv: {
    defaultMessage: "Import CSV",
    id: "g3WGoqC7FR",
    description: "Button to open the Issue Sheet CSV import dialog",
  },
  column: {
    defaultMessage: "Column",
    id: "QbB9yIc9Ea",
    description: "Button to open the add column dialog on the Issue Sheet page",
  },
  issue: {
    defaultMessage: "Issue",
    id: "JKZvTllRbs",
    description: "Button to open the create issue dialog on the Issue Sheet page",
  },
  summaryTotal: {
    defaultMessage: "{count} total",
    id: "ZAEjcUnwS/",
    description: "Badge showing total issue count on the Issue Sheet page",
  },
  summaryOpen: {
    defaultMessage: "{count} open",
    id: "IksPpT37Wn",
    description: "Badge showing open issue count on the Issue Sheet page",
  },
  summaryInProgress: {
    defaultMessage: "{count} in progress",
    id: "387cF7V3kv",
    description: "Badge showing in-progress issue count on the Issue Sheet page",
  },
  summaryResolved: {
    defaultMessage: "{count} resolved",
    id: "6MVGeLFs1Q",
    description: "Badge showing resolved issue count on the Issue Sheet page",
  },
  summaryMatching: {
    defaultMessage: "{count} matching",
    id: "1H3clNZiEb",
    description: "Badge showing filtered matching issue count on the Issue Sheet page",
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
  columnLocale: {
    defaultMessage: "Locale",
    id: "ou63JKkZ6w",
    description: "Table column header for target locale",
  },
  columnLink: {
    defaultMessage: "Link",
    id: "4No/FCwLf4",
    description: "Table column header for the issue link",
  },
  loadingIssues: {
    defaultMessage: "Loading issues…",
    id: "NpTAZ+fM1z",
    description: "Loading state shown while Issue Sheet rows are fetching",
  },
  loadIssuesError: {
    defaultMessage: "Issues could not be loaded.",
    id: "dj9zRisspO",
    description: "Error state when Issue Sheet rows fail to load",
  },
  noDetailsYet: {
    defaultMessage: "No details yet",
    id: "fd5kFNowDQ",
    description: "Fallback detail line when an issue has no description or source context",
  },
  issueKey: {
    defaultMessage: "Key: {key}",
    id: "DSKOYVYVQJ",
    description: "Shows the string key associated with an Issue Sheet row",
  },
  emptyTitle: {
    defaultMessage: "No issues in this view.",
    id: "mjQruHO/On",
    description: "Empty-state title when the filtered Issue Sheet has no rows",
  },
  emptyDescription: {
    defaultMessage: "Add an issue manually or from CAT to start tracking team context.",
    id: "dXiW8gUOg9",
    description: "Empty-state description when the filtered Issue Sheet has no rows",
  },
  openInCat: {
    defaultMessage: "Open in CAT",
    id: "dxMF5D4P3C",
    description: "Link label to open the related CAT segment for an issue",
  },
  openLink: {
    defaultMessage: "Open link",
    id: "QzVVoUN1T8",
    description: "Link label to open an external or linked issue URL",
  },
  enrichmentPlaceholder: {
    defaultMessage: "Run context later",
    id: "3u+0/ub7YY",
    description: "Placeholder for an enrichment custom column cell",
  },
  addNotePlaceholder: {
    defaultMessage: "Add note",
    id: "eG+YSYp5YT",
    description: "Placeholder for a long-text custom column cell",
  },
  updateFailed: {
    defaultMessage: "Update failed",
    id: "uZx7iljvGI",
    description: "Fallback toast when updating an Issue Sheet row fails",
  },
  cellUpdateFailed: {
    defaultMessage: "Cell update failed",
    id: "//aw3pq5aP",
    description: "Fallback toast when updating a custom Issue Sheet cell fails",
  },
  requestFailed: {
    defaultMessage: "Request failed",
    id: "v5cHP+g65A",
    description: "Fallback error when an Issue Sheet API request fails",
  },
  addColumnTitle: {
    defaultMessage: "Add column",
    id: "R68TUJrkVn",
    description: "Title of the dialog to add a custom Issue Sheet column",
  },
  addColumnDescription: {
    defaultMessage: "Add a project-specific workflow column to the Issue Sheet.",
    id: "8Wv1MRwzXX",
    description: "Description of the dialog to add a custom Issue Sheet column",
  },
  columnLabelPlaceholder: {
    defaultMessage: "Column label, e.g. Sprint",
    id: "7zCB6p8hxw",
    description: "Placeholder for the custom column label input",
  },
  columnKeyPlaceholder: {
    defaultMessage: "column_key",
    id: "a6hpjYmFM1",
    description: "Placeholder for the custom column key input",
  },
  columnTypePlaceholder: {
    defaultMessage: "Column type",
    id: "duqEj6Omtc",
    description: "Placeholder for the custom column type select",
  },
  columnOptionsPlaceholder: {
    defaultMessage: "For select: Backlog, Sprint 24, Blocked",
    id: "e1VRshKvtz",
    description: "Placeholder for optional select values when creating a custom column",
  },
  addColumnSubmit: {
    defaultMessage: "Add column",
    id: "vcWkRHmX1+",
    description: "Submit button in the add column dialog",
  },
  columnAdded: {
    defaultMessage: "Column added",
    id: "NO+1ZaqMKM",
    description: "Toast when a custom Issue Sheet column is created successfully",
  },
  columnCreateFailed: {
    defaultMessage: "Column create failed",
    id: "EAE54Sl6XL",
    description: "Fallback toast when creating a custom Issue Sheet column fails",
  },
});
