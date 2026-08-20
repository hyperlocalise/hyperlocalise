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

export const issueBulkActionBarMessages = defineMessages({
  selectedCount: {
    defaultMessage: "{count, plural, one {# issue selected} other {# issues selected}}",
    id: "3ql4zcu6fu",
    description: "Summary of how many issues are selected for bulk actions",
  },
  selectAllLoaded: {
    defaultMessage: "Select all loaded",
    id: "MBw6r00XBp",
    description: "Bulk action to select every issue in the current loaded list",
  },
  clearSelection: {
    defaultMessage: "Clear selection",
    id: "jMXm5EYCQP",
    description: "Bulk action to clear the current issue selection",
  },
  assign: {
    defaultMessage: "Assign",
    id: "pNAbj0ztLi",
    description: "Bulk action to assign selected issues",
  },
  unassign: {
    defaultMessage: "Unassign",
    id: "aQgD9ppYhP",
    description: "Bulk action to unassign selected issues",
  },
  setStatus: {
    defaultMessage: "Status",
    id: "xRY53GWVL8",
    description: "Bulk action menu label to change status on selected issues",
  },
  setPriority: {
    defaultMessage: "Priority",
    id: "+Q1YYBcFG/",
    description: "Bulk action menu label to change priority on selected issues",
  },
  setIssueType: {
    defaultMessage: "Type",
    id: "q+vOWtU/QG",
    description: "Bulk action menu label to change issue type on selected issues",
  },
  assignDisabledMixedProjects: {
    defaultMessage: "Assign works when selected issues belong to one project",
    id: "EqlihiOWKx",
    description: "Tooltip when bulk assign is disabled for a multi-project selection",
  },
  selectionLimitReached: {
    defaultMessage: "You can select at most {max} issues",
    id: "sbdvj0ZEFg",
    description: "Shown when the issue bulk selection limit is reached",
  },
  bulkSuccess: {
    defaultMessage: "Updated {updated} issue(s)",
    id: "576RCOuTLO",
    description: "Toast after a fully successful issue bulk action",
  },
  bulkPartial: {
    defaultMessage: "Updated {updated} of {requested} issue(s). {failed} failed.",
    id: "frNSjho/8d",
    description: "Toast after a partially successful issue bulk action",
  },
  bulkFailed: {
    defaultMessage: "Could not update selected issues",
    id: "eOsFs4OoCj",
    description: "Toast when every issue in a bulk action failed",
  },
  bulkPending: {
    defaultMessage: "Updating issues...",
    id: "P/9I6WaWRN",
    description: "Accessible label while a bulk issue action is running",
  },
  selectAllLoadedAria: {
    defaultMessage: "Select all loaded issues",
    id: "yD2L9eM3l9",
    description: "Accessible label for the select-all-loaded checkbox",
  },
  rowSelectAria: {
    defaultMessage: "Select issue {title}",
    id: "82drjDfpox",
    description: "Accessible label for selecting an issue row for bulk actions",
  },
});
