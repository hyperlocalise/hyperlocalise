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

export const jobsListToolbarMessages = defineMessages({
  searchLabel: {
    defaultMessage: "Search",
    id: "FgpL0Qp0e5",
    description: "Accessible label for the jobs list search field",
  },
  filterButton: {
    defaultMessage: "Filter",
    id: "jcSSc4wiBK",
    description: "Button that opens the jobs list filter popover",
  },
  filterButtonWithCount: {
    defaultMessage: "Filter ({count})",
    id: "W3I3Xglsup",
    description: "Filter button label when jobs list filters are active",
  },
  filterPopoverTitle: {
    defaultMessage: "Filters",
    id: "3W7isWjvZh",
    description: "Title for the jobs list filter popover",
  },
  statusLabel: {
    defaultMessage: "Status",
    id: "P041ZEKjF5",
    description: "Label for the jobs list status filter",
  },
  chipStatus: {
    defaultMessage: "Status: {value}",
    id: "ozEbWfdaHV",
    description: "Active jobs filter chip showing the selected status",
  },
  chipSearch: {
    defaultMessage: "Search: {value}",
    id: "L8xTOJqX0d",
    description: "Active jobs filter chip showing the current search query",
  },
  removeChipAriaLabel: {
    defaultMessage: "Remove {label}",
    id: "+2o7dFzpfn",
    description: "Accessible label for removing an active jobs filter chip",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "W+B8lwWr04",
    description: "Button that clears all active jobs list filters",
  },
});
