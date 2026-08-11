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

export const issueAssigneePickerMessages = defineMessages({
  unassigned: {
    defaultMessage: "Unassigned",
    id: "YDpITGOpDT",
    description: "Assignee picker option to clear the assignee",
  },
  assignToMe: {
    defaultMessage: "Assign to me",
    id: "SSB8f+XN3w",
    description: "Assignee picker shortcut to assign the current user",
  },
  searchPlaceholder: {
    defaultMessage: "Search by name or email…",
    id: "SynhGNu72Q",
    description: "Placeholder for assignee picker search input",
  },
  empty: {
    defaultMessage: "No members found.",
    id: "mWEB+wjuUJ",
    description: "Empty state when assignee search has no matches",
  },
  loading: {
    defaultMessage: "Loading members…",
    id: "FrF4P2cRG5",
    description: "Loading state for assignee picker members",
  },
  membersGroup: {
    defaultMessage: "Members",
    id: "pKzlTiRlHt",
    description: "Group label for assignable workspace members",
  },
  triggerAria: {
    defaultMessage: "Select assignee",
    id: "YspwpitZs7",
    description: "Accessible label for the assignee picker trigger",
  },
});
