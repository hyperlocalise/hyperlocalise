"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const translationMemoriesPageViewMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Workspace",
    id: "jpAyQN4Z9E",
    description: "Eyebrow label above the translation memories page title",
  },
  pageTitle: {
    defaultMessage: "Translation Memories",
    id: "zHmiYq4Tm1",
    description: "Translation memories page heading",
  },
  pageDescription: {
    defaultMessage:
      "Create first-party workspace memories or sync provider translation memories. Provider memories stay read-only.",
    id: "RiqlM9/Nv4",
    description: "Translation memories page description under the heading",
  },
  memoryCount: {
    defaultMessage: "{count, plural, one {# memory} other {# memories}}",
    id: "hIXJeNB+nI",
    description: "Status label showing how many translation memories exist",
  },
  createMemory: {
    defaultMessage: "Create memory",
    id: "elDbGHn1Tb",
    description: "Button to open the create translation memory dialog",
  },
  searchLabel: {
    defaultMessage: "Search",
    id: "3zVs9fHVPp",
    description: "Label for the translation memories search field",
  },
  searchPlaceholder: {
    defaultMessage: "Name, project, or external ID...",
    id: "xYeE5w8BlW",
    description: "Placeholder for the translation memories search field",
  },
  sourceLabel: {
    defaultMessage: "Source",
    id: "/AcaMGSbw2",
    description: "Label for the translation memory source filter",
  },
  sourceAll: {
    defaultMessage: "All sources",
    id: "WWNLOhw0a6",
    description: "Source filter option for all translation memory sources",
  },
  sourceNative: {
    defaultMessage: "Workspace",
    id: "gUb6PUVMK5",
    description: "Source filter option for workspace-native translation memories",
  },
  sourceExternalTms: {
    defaultMessage: "Provider",
    id: "pT9uAzxhrd",
    description: "Source filter option for provider translation memories",
  },
  providerLabel: {
    defaultMessage: "Provider",
    id: "1GUuDck/5O",
    description: "Label for the translation memory provider filter",
  },
  providerAll: {
    defaultMessage: "All providers",
    id: "LhocbJWKLx",
    description: "Provider filter option for all TMS providers",
  },
  syncLabel: {
    defaultMessage: "Sync",
    id: "7lRnvA2tB9",
    description: "Label for the translation memory sync state filter",
  },
  syncAll: {
    defaultMessage: "All sync states",
    id: "SSDdQ9eeIj",
    description: "Sync filter option for all sync states",
  },
  syncSynced: {
    defaultMessage: "Synced",
    id: "qijGtvJg5o",
    description: "Sync filter option for synced translation memories",
  },
  syncStale: {
    defaultMessage: "Stale",
    id: "6QWIzhr7Co",
    description: "Sync filter option for stale translation memories",
  },
  syncSyncing: {
    defaultMessage: "Syncing",
    id: "VK45xdmq69",
    description: "Sync filter option for translation memories currently syncing",
  },
  syncError: {
    defaultMessage: "Sync error",
    id: "TKS/jcVkYV",
    description: "Sync filter option for translation memories with sync errors",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "pWWasO8LM0",
    description: "Button to reset translation memory list filters",
  },
  noFilterMatches: {
    defaultMessage: "No translation memories match your filters. <clear>Clear filters</clear>",
    id: "NanjjZ6X+o",
    description: "Empty filter state for translation memories, with a clear-filters action",
  },
  chooseTmsProjectTitle: {
    defaultMessage: "Choose a TMS project",
    id: "P1Kmf2k4/K",
    description: "Title prompting the user to select a TMS project for live memories",
  },
  chooseTmsProjectDescription: {
    defaultMessage:
      "Select a project above to load live translation memories from your connected provider.",
    id: "6E7bAH/1Ep",
    description: "Description prompting the user to select a TMS project for live memories",
  },
  emptyTitle: {
    defaultMessage: "No translation memories yet",
    id: "zQR9HH34IW",
    description: "Empty state title when the workspace has no translation memories",
  },
  emptyTitleConnectProvider: {
    defaultMessage: "Connect a TMS provider",
    id: "kYuCdnk20K",
    description: "Empty state title when no TMS provider is connected",
  },
  emptyDescriptionCreate: {
    defaultMessage:
      "Create a workspace memory, import entries, then assign it to the projects that should use it.",
    id: "hoUlxWeu2t",
    description: "Empty state description when the user can create translation memories",
  },
  emptyDescriptionWithProvider: {
    defaultMessage:
      "Provider translation memories appear here after sync. Connect or resync a TMS provider from Integrations if you expected to see one.",
    id: "ZwXdX+nC9a",
    description: "Empty state description when a TMS provider is connected but no memories exist",
  },
  emptyDescriptionWithoutProvider: {
    defaultMessage:
      "Connect Crowdin, Phrase, Smartling, or Lokalise from Integrations to sync translation memories into this workspace.",
    id: "w+rjynq1UP",
    description: "Empty state description when no TMS provider is connected",
  },
  paginationSummary: {
    defaultMessage: "Showing {pageStart}–{pageEnd} of {memoryTotal} translation memories",
    id: "CHjEMV0nUm",
    description: "Pagination summary for the translation memories list",
  },
  paginationPage: {
    defaultMessage: "Page {page} of {totalPages}",
    id: "KoWP5ExqQO",
    description: "Current page indicator for the translation memories list",
  },
  previousPage: {
    defaultMessage: "Previous",
    id: "v2L2WwyVJn",
    description: "Button to go to the previous page of translation memories",
  },
  nextPage: {
    defaultMessage: "Next",
    id: "Vs00Rn62Ft",
    description: "Button to go to the next page of translation memories",
  },
  createDialogTitle: {
    defaultMessage: "Create translation memory",
    id: "xmtAgPTe6t",
    description: "Title of the create translation memory dialog",
  },
  createDialogDescription: {
    defaultMessage:
      "Add a first-party memory library. You can import and edit entries after creation.",
    id: "0LWDKXES/c",
    description: "Description of the create translation memory dialog",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "LCZsgeJImu",
    description: "Label for the translation memory name field",
  },
  namePlaceholder: {
    defaultMessage: "Marketing launch memory",
    id: "z5UyTwc582",
    description: "Placeholder for the translation memory name field",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "qU7FzWhWvd",
    description: "Label for the translation memory description field",
  },
  descriptionPlaceholder: {
    defaultMessage: "When this memory should be used",
    id: "FMJWoiFuqB",
    description: "Placeholder for the translation memory description field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "wyGp5zCVTb",
    description: "Cancel button in the create translation memory dialog",
  },
});
