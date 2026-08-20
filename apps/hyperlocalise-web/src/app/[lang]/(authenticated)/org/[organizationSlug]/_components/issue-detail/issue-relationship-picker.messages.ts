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

export const issueRelationshipPickerMessages = defineMessages({
  addButton: {
    defaultMessage: "Add relationship",
    id: "s1stMk8yBo",
    description: "Button that opens the relationship picker popover",
  },
  searchPlaceholder: {
    defaultMessage: "Search issues…",
    id: "7Hd4+o+eaU",
    description: "Placeholder for the issue search input in the relationship picker",
  },
  loading: {
    defaultMessage: "Searching…",
    id: "ASfBsxAsy6",
    description: "Shown while the relationship target search is in flight",
  },
  empty: {
    defaultMessage: "No issues found",
    id: "7GXNJdLyH7",
    description: "Shown when the relationship target search returns no results",
  },
});
