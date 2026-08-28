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

export const tmEntryExplorerMessages = defineMessages({
  searchLabel: {
    defaultMessage: "Search source and target text",
    id: "XBIwe6jLdQ",
    description: "Accessible label for the translation memory entry search field",
  },
  searchPlaceholder: {
    defaultMessage: "Search source or target text",
    id: "4aTkFyER33",
    description: "Placeholder for the translation memory entry search field",
  },
  filterButton: {
    defaultMessage: "Filters",
    id: "cq8+wKJLJG",
    description: "Button that opens translation memory entry filters",
  },
  filterButtonWithCount: {
    defaultMessage: "Filters ({count})",
    id: "KhRVjtTnTz",
    description: "Filter button label when translation memory entry filters are active",
  },
  filterPopoverTitle: {
    defaultMessage: "Filter entries",
    id: "V3RuMxqgSZ",
    description: "Title of the translation memory entry filter popover",
  },
  sourceLocaleLabel: {
    defaultMessage: "Source locale",
    id: "aa15mSwX4W",
    description: "Label for the source locale filter",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "C4Rv6cR7my",
    description: "Label for the target locale filter",
  },
  reviewStatusLabel: {
    defaultMessage: "Review state",
    id: "CFK4BGiWin",
    description: "Label for the review status filter",
  },
  originLabel: {
    defaultMessage: "Origin",
    id: "n7fzXxI33N",
    description: "Label for the origin filter",
  },
  providerLabel: {
    defaultMessage: "Provider",
    id: "jgywbYAAhH",
    description: "Label for the provider filter",
  },
  creatorLabel: {
    defaultMessage: "Creator",
    id: "EaYWwlX+vF",
    description: "Label for the creator filter",
  },
  creatorPlaceholder: {
    defaultMessage: "Creator user ID",
    id: "6vcGtoPKc6",
    description: "Placeholder for the creator user ID filter",
  },
  modifiedFromLabel: {
    defaultMessage: "Modified from",
    id: "7aOYNlbDse",
    description: "Label for the modified-from date filter",
  },
  modifiedToLabel: {
    defaultMessage: "Modified to",
    id: "VvUOA2CC3F",
    description: "Label for the modified-to date filter",
  },
  importBatchLabel: {
    defaultMessage: "Import batch",
    id: "3Gmldz+Qzp",
    description: "Label for the import batch filter",
  },
  importBatchPlaceholder: {
    defaultMessage: "Import batch ID",
    id: "nxVF3ARuwj",
    description: "Placeholder for the import batch ID filter",
  },
  anyValue: {
    defaultMessage: "Any",
    id: "HIVm1saP2n",
    description: "Option that clears a translation memory entry filter",
  },
  sortByLabel: {
    defaultMessage: "Sort by",
    id: "cTgMLHmn1U",
    description: "Accessible label for the translation memory entry sort field",
  },
  orderLabel: {
    defaultMessage: "Order",
    id: "x5RsQtpxzS",
    description: "Accessible label for the translation memory entry sort direction",
  },
  sortCreatedAt: {
    defaultMessage: "Created",
    id: "ENzJH/YOAt",
    description: "Sort option for translation memory entry created time",
  },
  sortUpdatedAt: {
    defaultMessage: "Modified",
    id: "8UVXVLYDSf",
    description: "Sort option for translation memory entry modified time",
  },
  sortDirDesc: {
    defaultMessage: "Newest first",
    id: "NczS6RXjPB",
    description: "Descending sort direction for translation memory entries",
  },
  sortDirAsc: {
    defaultMessage: "Oldest first",
    id: "N5Oh6UkBrk",
    description: "Ascending sort direction for translation memory entries",
  },
  reviewApproved: {
    defaultMessage: "Approved",
    id: "yDRqU0S/W9",
    description: "Approved review status for a translation memory entry",
  },
  reviewPending: {
    defaultMessage: "Pending",
    id: "HXvIFMFODd",
    description: "Pending review status for a translation memory entry",
  },
  reviewRejected: {
    defaultMessage: "Rejected",
    id: "vch5agnkDa",
    description: "Rejected review status for a translation memory entry",
  },
  originManual: {
    defaultMessage: "Manual",
    id: "EcDz2IQknb",
    description: "Manual origin for a translation memory entry",
  },
  originImport: {
    defaultMessage: "Import",
    id: "biOvOrRTZF",
    description: "Import origin for a translation memory entry",
  },
  originSync: {
    defaultMessage: "Sync",
    id: "gBuKJZ8SD6",
    description: "Sync origin for a translation memory entry",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "+H/71gbTfh",
    description: "Button that clears translation memory entry filters",
  },
  removeChipAriaLabel: {
    defaultMessage: "Remove {label} filter",
    id: "oiv9XDlV5Q",
    description: "Accessible label for removing an active translation memory entry filter chip",
  },
  chipSearch: {
    defaultMessage: "Search: {value}",
    id: "or4mLWN3nr",
    description: "Chip label for the active translation memory entry search",
  },
  chipSourceLocale: {
    defaultMessage: "Source: {value}",
    id: "Wlx+O8qTTn",
    description: "Chip label for the active source locale filter",
  },
  chipTargetLocale: {
    defaultMessage: "Target: {value}",
    id: "oJhe7yX8oA",
    description: "Chip label for the active target locale filter",
  },
  chipReviewStatus: {
    defaultMessage: "Review: {value}",
    id: "1jAp3L0qGd",
    description: "Chip label for the active review status filter",
  },
  chipOrigin: {
    defaultMessage: "Origin: {value}",
    id: "jJ0I/EZEoA",
    description: "Chip label for the active origin filter",
  },
  chipProvider: {
    defaultMessage: "Provider: {value}",
    id: "kDiXBdNQE9",
    description: "Chip label for the active provider filter",
  },
  chipCreator: {
    defaultMessage: "Creator: {value}",
    id: "CALKqH15lR",
    description: "Chip label for the active creator filter",
  },
  chipModifiedFrom: {
    defaultMessage: "From {value}",
    id: "RUxqjtA9CF",
    description: "Chip label for the modified-from filter",
  },
  chipModifiedTo: {
    defaultMessage: "To {value}",
    id: "kQdK+U9dBZ",
    description: "Chip label for the modified-to filter",
  },
  chipImportBatch: {
    defaultMessage: "Batch: {value}",
    id: "VG/iXFDz5w",
    description: "Chip label for the active import batch filter",
  },
  loadingAria: {
    defaultMessage: "Loading translation memory entries",
    id: "Yt7zrC9Btd",
    description: "Accessible label for the translation memory entry loading state",
  },
  statusLoading: {
    defaultMessage: "Loading entries",
    id: "mRzD1p2FiB",
    description: "Live status announced while translation memory entries are loading",
  },
  statusCount: {
    defaultMessage: "{total, plural, one {# matching entry} other {# matching entries}}",
    id: "q7oSHUgy5r",
    description: "Live status announcing how many translation memory entries match the query",
  },
  empty: {
    defaultMessage: "No entries match this search.",
    id: "UBL2U2Jzs0",
    description: "Empty state when translation memory entry search returns no rows",
  },
  emptyNoFilters: {
    defaultMessage: "No entries yet.",
    id: "nYl8yPSIEu",
    description: "Empty state when a translation memory has no entries",
  },
  error: {
    defaultMessage: "Unable to load entries.",
    id: "zY3jTIX8o6",
    description: "Error state when translation memory entries fail to load",
  },
  retry: {
    defaultMessage: "Try again",
    id: "uOKEevBA23",
    description: "Button to retry loading translation memory entries",
  },
  previousPage: {
    defaultMessage: "Previous",
    id: "GRBZS77KwX",
    description: "Button to go to the previous translation memory entry page",
  },
  nextPage: {
    defaultMessage: "Next",
    id: "e+ec0C7jOE",
    description: "Button to go to the next translation memory entry page",
  },
  localePair: {
    defaultMessage: "{sourceLocale} → {targetLocale}",
    id: "xj2EXXNNqx",
    description: "Locale pair shown on a translation memory entry row",
  },
  openEntryAria: {
    defaultMessage: "Open entry {sourceText}",
    id: "Aslv6sgV4o",
    description: "Accessible label for opening a translation memory entry",
  },
  closeEntry: {
    defaultMessage: "Back to results",
    id: "MYDqLAmTSX",
    description: "Button that returns from a selected translation memory entry to the list",
  },
  selectedEntry: {
    defaultMessage: "Selected entry",
    id: "TN1PxXk6zi",
    description: "Heading for the currently selected translation memory entry",
  },
  filterByCreator: {
    defaultMessage: "Filter by creator",
    id: "IiixLmh3Z0",
    description: "Button that applies the current entry creator as a filter",
  },
  filterByBatch: {
    defaultMessage: "Filter by import batch",
    id: "M2MpuB71Nj",
    description: "Button that applies the current entry import batch as a filter",
  },
  invalidCursor: {
    defaultMessage: "That page is no longer valid. Showing the first page.",
    id: "3xXiVgOezJ",
    description: "Status announced when a translation memory entry cursor can no longer be used",
  },
  editEntry: {
    defaultMessage: "Edit",
    id: "fnnzeRJcnZ",
    description: "Button to edit a translation memory entry",
  },
  deleteEntry: {
    defaultMessage: "Delete",
    id: "4mAN6mkTxq",
    description: "Button to delete a translation memory entry",
  },
});
