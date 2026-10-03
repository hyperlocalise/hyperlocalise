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

export const contentEditorLinkedIssuesDialogMessages = defineMessages({
  title: {
    defaultMessage: "Queries",
    id: "0lx5E4LTqS",
    description: "Dialog title for queries linked to a CAT translation string",
  },
  description: {
    defaultMessage: "Create or link queries for this string. Open a query to collaborate.",
    id: "4gyYY4W7Mc",
    description: "Dialog description for managing queries linked to a CAT string",
  },
  createIssue: {
    defaultMessage: "Create query",
    id: "sFkawfaGEH",
    description: "Button to create a new query from the current string",
  },
  linkExisting: {
    defaultMessage: "Link existing query",
    id: "rk48TpeLE8",
    description: "Button to open the picker for linking an existing query",
  },
  searchIssues: {
    defaultMessage: "Search queries…",
    id: "JSiXNobb1k",
    description: "Placeholder for searching project queries to link",
  },
  emptyLinked: {
    defaultMessage: "No queries linked to this string yet.",
    id: "fEyFw7cacE",
    description: "Empty state when the string has no linked queries",
  },
  loadError: {
    defaultMessage: "Linked queries could not be loaded.",
    id: "8pQ21HfI3s",
    description: "Error when fetching queries linked to a string fails",
  },
  linkFailed: {
    defaultMessage: "Query could not be linked.",
    id: "I0cuFjmafA",
    description: "Toast when linking an existing query fails",
  },
  unlinkFailed: {
    defaultMessage: "Query could not be unlinked.",
    id: "Nc2Rh7BgjZ",
    description: "Toast when unlinking a query fails",
  },
  linked: {
    defaultMessage: "Query linked",
    id: "lP/Y+b1jar",
    description: "Toast when an existing query is linked to the string",
  },
  unlinked: {
    defaultMessage: "Query unlinked",
    id: "iP6WBy5oEv",
    description: "Toast when a query is unlinked from the string",
  },
  unlink: {
    defaultMessage: "Unlink",
    id: "o7Q2VF9914",
    description: "Button to unlink an issue from the string",
  },
  openIssue: {
    defaultMessage: "Open",
    id: "xixmTqHWvz",
    description: "Button to open a linked issue detail page",
  },
  noMatches: {
    defaultMessage: "No matching queries.",
    id: "SxB5bmPaaR",
    description: "Empty state when query search returns no results",
  },
  linkingUnavailable: {
    defaultMessage: "Linking queries requires a native project string.",
    id: "CkeBaA5l+k",
    description: "Shown when query linking is unavailable for external CAT",
  },
  requestFailed: {
    defaultMessage: "Request failed",
    id: "6OBycEw5vD",
    description: "Fallback error when an Issues API request fails",
  },
  defaultTitle: {
    defaultMessage: "Context needed: {key}",
    id: "L0g+No60zf",
    description: "Default title when creating an issue from a CAT string",
  },
  openInContentEditorLinkLabel: {
    defaultMessage: "Open in Content Editor",
    id: "MRKdPjdzv/",
    description: "Link label stored on issues created from the Content Editor",
  },
});
