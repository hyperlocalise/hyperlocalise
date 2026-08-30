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

  clearFilters: {
    defaultMessage: "Clear search",
    id: "vGmSBVyRPS",
    description: "Button to reset the glossary search",
  },
  noFilterMatches: {
    defaultMessage: "No glossaries match your search. <clear>Clear search</clear>",
    id: "9HdSrp2HI/",
    description: "Empty search state for glossaries, with a clear-search action",
  },
  nativeSectionTitle: {
    defaultMessage: "Workspace glossaries",
    id: "dLOnbBe+SR",
    description: "Heading for workspace glossaries",
  },
  externalSectionTitle: {
    defaultMessage: "Provider glossaries",
    id: "iTLkbt2liA",
    description: "Heading for persisted provider glossaries",
  },
  crowdinSectionTitle: {
    defaultMessage: "Crowdin glossaries",
    id: "CckeviPE6F",
    description: "Heading for live Crowdin glossaries",
  },
  nativeEmptyTitle: {
    defaultMessage: "No workspace glossaries",
    id: "032V4XY9wg",
    description:
      "Empty state title for the workspace glossary section when creation is unavailable",
  },
  nativeEmptyDescription: {
    defaultMessage: "Workspace glossaries created in this workspace will appear here.",
    id: "im9nnXP/O2",
    description: "Empty state description for workspace glossaries",
  },
  externalEmptyTitle: {
    defaultMessage: "No provider glossaries",
    id: "ZiWVuGHeQL",
    description: "Empty state title for a connected provider with no glossaries",
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
  workspaceEmptyTitle: {
    defaultMessage: "Build your terminology library",
    id: "y4hQxxj/zM",
    description: "Primary empty state title for a workspace with no glossaries",
  },
  workspaceEmptyDescription: {
    defaultMessage:
      "Create a workspace glossary for approved terms, or connect a provider to bring in an existing term base.",
    id: "BQ8dKEbgn2",
    description: "Primary empty state guidance for a workspace with no glossaries",
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
  crowdinEmptyTitle: {
    defaultMessage: "No Crowdin glossaries found",
    id: "xZi8vylThF",
    description: "Empty state title for live Crowdin glossaries",
  },
  crowdinEmptyDescription: {
    defaultMessage:
      "Choose another project or check Crowdin for glossaries available to this workspace.",
    id: "T2BImrk8yG",
    description: "Empty state description for live Crowdin glossaries",
  },
  connectProvider: {
    defaultMessage: "Connect a provider",
    id: "LqB7EIRaRe",
    description: "Secondary empty-state action to connect a TMS provider",
  },
  openIntegrations: {
    defaultMessage: "Open integrations",
    id: "BiKIjgXcMN",
    description: "Secondary empty-state action to open provider integrations",
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
  sortLabel: {
    defaultMessage: "Sort",
    id: "9DtnBnymqw",
    description: "Label for the Crowdin glossary ordering control",
  },
  sortNewest: {
    defaultMessage: "Newest first",
    id: "Xo2+rtWc3U",
    description: "Crowdin glossary ordering option for newest glossaries",
  },
  sortNameAsc: {
    defaultMessage: "Name A–Z",
    id: "lNH8JueKxa",
    description: "Crowdin glossary ordering option for ascending names",
  },
  sortNameDesc: {
    defaultMessage: "Name Z–A",
    id: "BBn+JiQbC1",
    description: "Crowdin glossary ordering option for descending names",
  },
  crowdinPaginationSummary: {
    defaultMessage: "Crowdin page {page}",
    id: "8mLorWvZHa",
    description: "Pagination summary for the live Crowdin glossary list",
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
  projectLabel: {
    defaultMessage: "Assign glossary to the following projects:",
    id: "cnWyuPT5ua",
    description: "Label for the project multi-select on glossary creation",
  },
  projectPlaceholder: {
    defaultMessage: "Select projects",
    id: "yt3gzzy/zO",
    description: "Placeholder for the project multi-select",
  },
  projectSearchPlaceholder: {
    defaultMessage: "Search projects",
    id: "jTZSup9Rup",
    description: "Search placeholder for the project multi-select",
  },
  projectSelectionEmpty: {
    defaultMessage: "No projects use this source locale.",
    id: "wUXhMGSGlH",
    description: "Empty state for the project multi-select",
  },
  projectOptional: {
    defaultMessage: "Optional. You can attach projects from the glossary detail page later.",
    id: "Ddq6ZN19JX",
    description: "Help text explaining that glossary project attachment can happen later",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Ir9T3sKw7D",
    description: "Cancel button in the create glossary dialog",
  },
});
