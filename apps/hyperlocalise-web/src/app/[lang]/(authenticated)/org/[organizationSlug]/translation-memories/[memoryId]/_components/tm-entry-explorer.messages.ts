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
        id: "tmEntryExplorer.searchLabel",
        description: "Accessible label for the translation memory entry search field",
    },
    searchPlaceholder: {
        defaultMessage: "Search source or target text",
        id: "tmEntryExplorer.searchPlaceholder",
        description: "Placeholder for the translation memory entry search field",
    },
    filterButton: {
        defaultMessage: "Filters",
        id: "tmEntryExplorer.filterButton",
        description: "Button that opens translation memory entry filters",
    },
    filterButtonWithCount: {
        defaultMessage: "Filters ({count})",
        id: "tmEntryExplorer.filterButtonWithCount",
        description: "Filter button label when translation memory entry filters are active",
    },
    filterPopoverTitle: {
        defaultMessage: "Filter entries",
        id: "tmEntryExplorer.filterPopoverTitle",
        description: "Title of the translation memory entry filter popover",
    },
    sourceLocaleLabel: {
        defaultMessage: "Source locale",
        id: "tmEntryExplorer.sourceLocaleLabel",
        description: "Label for the source locale filter",
    },
    targetLocaleLabel: {
        defaultMessage: "Target locale",
        id: "tmEntryExplorer.targetLocaleLabel",
        description: "Label for the target locale filter",
    },
    reviewStatusLabel: {
        defaultMessage: "Review state",
        id: "tmEntryExplorer.reviewStatusLabel",
        description: "Label for the review status filter",
    },
    originLabel: {
        defaultMessage: "Origin",
        id: "tmEntryExplorer.originLabel",
        description: "Label for the origin filter",
    },
    providerLabel: {
        defaultMessage: "Provider",
        id: "tmEntryExplorer.providerLabel",
        description: "Label for the provider filter",
    },
    creatorLabel: {
        defaultMessage: "Creator",
        id: "tmEntryExplorer.creatorLabel",
        description: "Label for the creator filter",
    },
    creatorPlaceholder: {
        defaultMessage: "Creator user ID",
        id: "tmEntryExplorer.creatorPlaceholder",
        description: "Placeholder for the creator user ID filter",
    },
    modifiedFromLabel: {
        defaultMessage: "Modified from",
        id: "tmEntryExplorer.modifiedFromLabel",
        description: "Label for the modified-from date filter",
    },
    modifiedToLabel: {
        defaultMessage: "Modified to",
        id: "tmEntryExplorer.modifiedToLabel",
        description: "Label for the modified-to date filter",
    },
    importBatchLabel: {
        defaultMessage: "Import batch",
        id: "tmEntryExplorer.importBatchLabel",
        description: "Label for the import batch filter",
    },
    importBatchPlaceholder: {
        defaultMessage: "Import batch ID",
        id: "tmEntryExplorer.importBatchPlaceholder",
        description: "Placeholder for the import batch ID filter",
    },
    anyValue: {
        defaultMessage: "Any",
        id: "tmEntryExplorer.anyValue",
        description: "Option that clears a translation memory entry filter",
    },
    sortByLabel: {
        defaultMessage: "Sort by",
        id: "tmEntryExplorer.sortByLabel",
        description: "Accessible label for the translation memory entry sort field",
    },
    orderLabel: {
        defaultMessage: "Order",
        id: "tmEntryExplorer.orderLabel",
        description: "Accessible label for the translation memory entry sort direction",
    },
    sortCreatedAt: {
        defaultMessage: "Created",
        id: "tmEntryExplorer.sortCreatedAt",
        description: "Sort option for translation memory entry created time",
    },
    sortUpdatedAt: {
        defaultMessage: "Modified",
        id: "tmEntryExplorer.sortUpdatedAt",
        description: "Sort option for translation memory entry modified time",
    },
    sortDirDesc: {
        defaultMessage: "Newest first",
        id: "tmEntryExplorer.sortDirDesc",
        description: "Descending sort direction for translation memory entries",
    },
    sortDirAsc: {
        defaultMessage: "Oldest first",
        id: "tmEntryExplorer.sortDirAsc",
        description: "Ascending sort direction for translation memory entries",
    },
    reviewApproved: {
        defaultMessage: "Approved",
        id: "tmEntryExplorer.reviewApproved",
        description: "Approved review status for a translation memory entry",
    },
    reviewPending: {
        defaultMessage: "Pending",
        id: "tmEntryExplorer.reviewPending",
        description: "Pending review status for a translation memory entry",
    },
    reviewRejected: {
        defaultMessage: "Rejected",
        id: "tmEntryExplorer.reviewRejected",
        description: "Rejected review status for a translation memory entry",
    },
    originManual: {
        defaultMessage: "Manual",
        id: "tmEntryExplorer.originManual",
        description: "Manual origin for a translation memory entry",
    },
    originImport: {
        defaultMessage: "Import",
        id: "tmEntryExplorer.originImport",
        description: "Import origin for a translation memory entry",
    },
    originSync: {
        defaultMessage: "Sync",
        id: "tmEntryExplorer.originSync",
        description: "Sync origin for a translation memory entry",
    },
    clearFilters: {
        defaultMessage: "Clear filters",
        id: "tmEntryExplorer.clearFilters",
        description: "Button that clears translation memory entry filters",
    },
    removeChipAriaLabel: {
        defaultMessage: "Remove {label} filter",
        id: "tmEntryExplorer.removeChipAriaLabel",
        description: "Accessible label for removing an active translation memory entry filter chip",
    },
    chipSearch: {
        defaultMessage: "Search: {value}",
        id: "tmEntryExplorer.chipSearch",
        description: "Chip label for the active translation memory entry search",
    },
    chipSourceLocale: {
        defaultMessage: "Source: {value}",
        id: "tmEntryExplorer.chipSourceLocale",
        description: "Chip label for the active source locale filter",
    },
    chipTargetLocale: {
        defaultMessage: "Target: {value}",
        id: "tmEntryExplorer.chipTargetLocale",
        description: "Chip label for the active target locale filter",
    },
    chipReviewStatus: {
        defaultMessage: "Review: {value}",
        id: "tmEntryExplorer.chipReviewStatus",
        description: "Chip label for the active review status filter",
    },
    chipOrigin: {
        defaultMessage: "Origin: {value}",
        id: "tmEntryExplorer.chipOrigin",
        description: "Chip label for the active origin filter",
    },
    chipProvider: {
        defaultMessage: "Provider: {value}",
        id: "tmEntryExplorer.chipProvider",
        description: "Chip label for the active provider filter",
    },
    chipCreator: {
        defaultMessage: "Creator: {value}",
        id: "tmEntryExplorer.chipCreator",
        description: "Chip label for the active creator filter",
    },
    chipModifiedFrom: {
        defaultMessage: "From {value}",
        id: "tmEntryExplorer.chipModifiedFrom",
        description: "Chip label for the modified-from filter",
    },
    chipModifiedTo: {
        defaultMessage: "To {value}",
        id: "tmEntryExplorer.chipModifiedTo",
        description: "Chip label for the modified-to filter",
    },
    chipImportBatch: {
        defaultMessage: "Batch: {value}",
        id: "tmEntryExplorer.chipImportBatch",
        description: "Chip label for the active import batch filter",
    },
    loadingAria: {
        defaultMessage: "Loading translation memory entries",
        id: "tmEntryExplorer.loadingAria",
        description: "Accessible label for the translation memory entry loading state",
    },
    statusLoading: {
        defaultMessage: "Loading entries",
        id: "tmEntryExplorer.statusLoading",
        description: "Live status announced while translation memory entries are loading",
    },
    statusCount: {
        defaultMessage:
            "{shown, plural, one {# entry} other {# entries}} on this page of {total, plural, one {# match} other {# matches}}",
        id: "tmEntryExplorer.statusCount",
        description: "Live status announcing the current translation memory entry page count",
    },
    empty: {
        defaultMessage: "No entries match this search.",
        id: "tmEntryExplorer.empty",
        description: "Empty state when translation memory entry search returns no rows",
    },
    emptyNoFilters: {
        defaultMessage: "No entries yet.",
        id: "tmEntryExplorer.emptyNoFilters",
        description: "Empty state when a translation memory has no entries",
    },
    error: {
        defaultMessage: "Unable to load entries.",
        id: "tmEntryExplorer.error",
        description: "Error state when translation memory entries fail to load",
    },
    retry: {
        defaultMessage: "Try again",
        id: "tmEntryExplorer.retry",
        description: "Button to retry loading translation memory entries",
    },
    previousPage: {
        defaultMessage: "Previous",
        id: "tmEntryExplorer.previousPage",
        description: "Button to go to the previous translation memory entry page",
    },
    nextPage: {
        defaultMessage: "Next",
        id: "tmEntryExplorer.nextPage",
        description: "Button to go to the next translation memory entry page",
    },
    localePair: {
        defaultMessage: "{sourceLocale} → {targetLocale}",
        id: "tmEntryExplorer.localePair",
        description: "Locale pair shown on a translation memory entry row",
    },
    openEntryAria: {
        defaultMessage: "Open entry {sourceText}",
        id: "tmEntryExplorer.openEntryAria",
        description: "Accessible label for opening a translation memory entry",
    },
    closeEntry: {
        defaultMessage: "Back to results",
        id: "tmEntryExplorer.closeEntry",
        description: "Button that returns from a selected translation memory entry to the list",
    },
    selectedEntry: {
        defaultMessage: "Selected entry",
        id: "tmEntryExplorer.selectedEntry",
        description: "Heading for the currently selected translation memory entry",
    },
    filterByCreator: {
        defaultMessage: "Filter by creator",
        id: "tmEntryExplorer.filterByCreator",
        description: "Button that applies the current entry creator as a filter",
    },
    filterByBatch: {
        defaultMessage: "Filter by import batch",
        id: "tmEntryExplorer.filterByBatch",
        description: "Button that applies the current entry import batch as a filter",
    },
    invalidCursor: {
        defaultMessage: "That page is no longer valid. Showing the first page.",
        id: "tmEntryExplorer.invalidCursor",
        description: "Status announced when a translation memory entry cursor can no longer be used",
    },
    editEntry: {
        defaultMessage: "Edit",
        id: "tmEntryExplorer.editEntry",
        description: "Button to edit a translation memory entry",
    },
    deleteEntry: {
        defaultMessage: "Delete",
        id: "tmEntryExplorer.deleteEntry",
        description: "Button to delete a translation memory entry",
    },
});
