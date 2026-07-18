"use client";

import { defineMessages } from "react-intl";

export const glossariesPageViewMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Workspace",
    id: "ugpx7KUX9X",
    description: "Eyebrow label above the glossaries page title",
  },
  pageTitle: {
    defaultMessage: "Glossaries",
    id: "VpdqFflIZ6",
    description: "Glossaries page heading",
  },
  pageDescription: {
    defaultMessage:
      "Create first-party workspace glossaries or sync provider term bases. Provider glossaries stay read-only.",
    id: "faIh9KrPi/",
    description: "Glossaries page description under the heading",
  },
  glossaryCount: {
    defaultMessage: "{count, plural, one {# glossary} other {# glossaries}}",
    id: "yGxOn6oNGU",
    description: "Status label showing how many glossaries exist",
  },
  createGlossary: {
    defaultMessage: "Create glossary",
    id: "ZuWdxYzYaK",
    description: "Button to open the create glossary dialog",
  },
  searchLabel: {
    defaultMessage: "Search",
    id: "yDYJAjyOdb",
    description: "Label for the glossaries search field",
  },
  searchPlaceholder: {
    defaultMessage: "Name, project, or external ID...",
    id: "IGfRG2bCrY",
    description: "Placeholder for the glossaries search field",
  },
  sourceLabel: {
    defaultMessage: "Source",
    id: "QAVlGw1a6j",
    description: "Label for the glossary source filter",
  },
  sourceAll: {
    defaultMessage: "All sources",
    id: "eAIQ4Y8Q3i",
    description: "Source filter option for all glossary sources",
  },
  sourceNative: {
    defaultMessage: "Workspace",
    id: "ZrA/LAv/+i",
    description: "Source filter option for workspace-native glossaries",
  },
  sourceExternalTms: {
    defaultMessage: "Provider",
    id: "RpVhGmmzel",
    description: "Source filter option for provider glossaries",
  },
  providerLabel: {
    defaultMessage: "Provider",
    id: "VDktuK9D7C",
    description: "Label for the glossary provider filter",
  },
  providerAll: {
    defaultMessage: "All providers",
    id: "LhocbJWKLx",
    description: "Provider filter option for all TMS providers",
  },
  resourceLabel: {
    defaultMessage: "Resource",
    id: "qOrpKFZ2EU",
    description: "Label for the glossary resource type filter",
  },
  resourceAll: {
    defaultMessage: "All resource types",
    id: "uukLNszv2X",
    description: "Resource type filter option for all glossary resource types",
  },
  resourceGlossary: {
    defaultMessage: "Glossary",
    id: "W402cvEu6n",
    description: "Resource type filter option for glossary resources",
  },
  resourceTermBase: {
    defaultMessage: "Term base",
    id: "L0gachMRlZ",
    description: "Resource type filter option for term base resources",
  },
  syncLabel: {
    defaultMessage: "Sync",
    id: "q5MIT8loA8",
    description: "Label for the glossary sync state filter",
  },
  syncAll: {
    defaultMessage: "All sync states",
    id: "SSDdQ9eeIj",
    description: "Sync filter option for all sync states",
  },
  syncSynced: {
    defaultMessage: "Synced",
    id: "CPfzUKHSJO",
    description: "Sync filter option for synced glossaries",
  },
  syncStale: {
    defaultMessage: "Stale",
    id: "vWSQHBkZt5",
    description: "Sync filter option for stale glossaries",
  },
  syncSyncing: {
    defaultMessage: "Syncing",
    id: "Dd7B9s1kqD",
    description: "Sync filter option for glossaries currently syncing",
  },
  syncError: {
    defaultMessage: "Sync error",
    id: "7z1XK9p1bT",
    description: "Sync filter option for glossaries with sync errors",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "hpZLGfM1av",
    description: "Button to reset glossary list filters",
  },
  noFilterMatches: {
    defaultMessage: "No glossaries match your filters. <clear>Clear filters</clear>",
    id: "HwI92QKVOs",
    description: "Empty filter state for glossaries, with a clear-filters action",
  },
  chooseTmsProjectTitle: {
    defaultMessage: "Choose a TMS project",
    id: "VTNiq0wxG3",
    description: "Title prompting the user to select a TMS project for live glossaries",
  },
  chooseTmsProjectDescription: {
    defaultMessage:
      "Select a project above to load live glossaries and term bases from your connected provider.",
    id: "JB6oDpJ4ax",
    description: "Description prompting the user to select a TMS project for live glossaries",
  },
  emptyTitle: {
    defaultMessage: "No glossaries yet",
    id: "ModLI3ew1I",
    description: "Empty state title when the workspace has no glossaries",
  },
  emptyTitleConnectProvider: {
    defaultMessage: "Connect a TMS provider",
    id: "kYuCdnk20K",
    description: "Empty state title when no TMS provider is connected",
  },
  emptyDescriptionCreate: {
    defaultMessage:
      "Create a workspace glossary, import terms, then assign it to the projects that should use it.",
    id: "PKEVEWrTkb",
    description: "Empty state description when the user can create glossaries",
  },
  emptyDescriptionWithProvider: {
    defaultMessage:
      "Provider glossaries and term bases appear here after sync. Connect or resync a TMS provider from Integrations if you expected to see one.",
    id: "6QF9Hq+l1/",
    description: "Empty state description when a TMS provider is connected but no glossaries exist",
  },
  emptyDescriptionWithoutProvider: {
    defaultMessage:
      "Connect Crowdin, Phrase, Smartling, or Lokalise from Integrations to sync glossaries into this workspace.",
    id: "/N1d6Fnf0y",
    description: "Empty state description when no TMS provider is connected",
  },
  paginationSummary: {
    defaultMessage: "Showing {pageStart}–{pageEnd} of {glossaryTotal} glossaries",
    id: "mX/u4fe+7s",
    description: "Pagination summary for the glossaries list",
  },
  paginationPage: {
    defaultMessage: "Page {page} of {totalPages}",
    id: "qP1TyGV4tR",
    description: "Current page indicator for the glossaries list",
  },
  previousPage: {
    defaultMessage: "Previous",
    id: "BUv0z8Fa04",
    description: "Button to go to the previous page of glossaries",
  },
  nextPage: {
    defaultMessage: "Next",
    id: "pUTlRV1r0u",
    description: "Button to go to the next page of glossaries",
  },
  createDialogTitle: {
    defaultMessage: "Create glossary",
    id: "9z3NnjcCwB",
    description: "Title of the create glossary dialog",
  },
  createDialogDescription: {
    defaultMessage:
      "Add a first-party terminology library. You can import and edit terms after creation.",
    id: "CiJvOvyPyH",
    description: "Description of the create glossary dialog",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "73NN5BdVas",
    description: "Label for the glossary name field",
  },
  namePlaceholder: {
    defaultMessage: "Product terminology",
    id: "CnZV1EVZQu",
    description: "Placeholder for the glossary name field",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "5fiIL1R9JM",
    description: "Label for the glossary description field",
  },
  descriptionPlaceholder: {
    defaultMessage: "Where this glossary should be used",
    id: "zA979oY1xH",
    description: "Placeholder for the glossary description field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Ir9T3sKw7D",
    description: "Cancel button in the create glossary dialog",
  },
});
