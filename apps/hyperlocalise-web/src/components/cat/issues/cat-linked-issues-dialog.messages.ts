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

export const catLinkedIssuesDialogMessages = defineMessages({
  title: {
    defaultMessage: "Linked issues",
    id: "zlTXMaTZ76",
    description: "Dialog title for issues linked to a CAT translation string",
  },
  description: {
    defaultMessage: "Create or link Issues for this string. Navigate to an issue to collaborate.",
    id: "qyJpxYtcpE",
    description: "Dialog description for managing issues linked to a CAT string",
  },
  createIssue: {
    defaultMessage: "Create issue",
    id: "t3xDK2/UrI",
    description: "Button to create a new issue from the current string",
  },
  linkExisting: {
    defaultMessage: "Link existing",
    id: "Dx55FkCrgu",
    description: "Button to open the picker for linking an existing issue",
  },
  searchIssues: {
    defaultMessage: "Search issues…",
    id: "XLWvL1I9Sv",
    description: "Placeholder for searching project issues to link",
  },
  emptyLinked: {
    defaultMessage: "No issues linked to this string yet.",
    id: "OsfTn/OWg9",
    description: "Empty state when the string has no linked issues",
  },
  loadError: {
    defaultMessage: "Linked issues could not be loaded.",
    id: "Db5EVZd7B1",
    description: "Error when fetching issues linked to a string fails",
  },
  linkFailed: {
    defaultMessage: "Issue could not be linked.",
    id: "9FhGZjmVTF",
    description: "Toast when linking an existing issue fails",
  },
  unlinkFailed: {
    defaultMessage: "Issue could not be unlinked.",
    id: "3Kr+riOCmU",
    description: "Toast when unlinking an issue fails",
  },
  linked: {
    defaultMessage: "Issue linked",
    id: "kUu0YJ4PK9",
    description: "Toast when an existing issue is linked to the string",
  },
  unlinked: {
    defaultMessage: "Issue unlinked",
    id: "vtr+j44k6z",
    description: "Toast when an issue is unlinked from the string",
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
    defaultMessage: "No matching issues.",
    id: "xTMvZyc/zN",
    description: "Empty state when issue search returns no results",
  },
  linkingUnavailable: {
    defaultMessage: "Linking requires a native project string.",
    id: "I3HI2ZtzmX",
    description: "Shown when translation key linking is unavailable for external CAT",
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
  openInCatLinkLabel: {
    defaultMessage: "Open in CAT",
    id: "fO8mdMfpdf",
    description: "Link label stored on issues created from CAT",
  },
});
