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

export const glossaryDetailPageContentMessages = defineMessages({
  loadGlossaryFailed: {
    defaultMessage: "Unable to load glossary",
    id: "zdN3ToHnj1",
    description: "Fallback error when a glossary fails to load",
  },
  loadTermsFailed: {
    defaultMessage: "Unable to load terms",
    id: "JemgHUamHh",
    description: "Fallback error when glossary terms fail to load",
  },
  loadProjectsFailed: {
    defaultMessage: "Unable to load projects",
    id: "XYe4THixuv",
    description: "Fallback error when projects fail to load on the glossary detail page",
  },
  saveTermFailed: {
    defaultMessage: "Unable to save term",
    id: "iCizofrwwK",
    description: "Fallback error when saving a glossary term fails",
  },
  deleteTermFailed: {
    defaultMessage: "Unable to delete term",
    id: "gN0y8UhzTR",
    description: "Fallback error when deleting a glossary term fails",
  },
  importTermsFailed: {
    defaultMessage: "Unable to import terms",
    id: "ujii3FwBE5",
    description: "Fallback error when importing glossary terms fails",
  },
  assignProjectFailed: {
    defaultMessage: "Unable to assign project",
    id: "TiFchnoh6y",
    description: "Fallback error when assigning a project to a glossary fails",
  },
  removeProjectFailed: {
    defaultMessage: "Unable to remove project",
    id: "1iMVYFQbGc",
    description: "Fallback error when removing a project from a glossary fails",
  },
  termUpdated: {
    defaultMessage: "Term updated",
    id: "msSg0cV36G",
    description: "Toast after a glossary term is updated successfully",
  },
  termAdded: {
    defaultMessage: "Term added",
    id: "y4YFxtSnJF",
    description: "Toast after a glossary term is added successfully",
  },
  termDeleted: {
    defaultMessage: "Term deleted",
    id: "isRKrk8w8z",
    description: "Toast after a glossary term is deleted successfully",
  },
  termsImported: {
    defaultMessage: "Imported {count, plural, one {# term} other {# terms}}",
    id: "w69BfzSUw0",
    description: "Toast after glossary terms are imported from a file",
  },
  projectAssigned: {
    defaultMessage: "Project assigned",
    id: "lgRbICxGNz",
    description: "Toast after a project is assigned to a glossary",
  },
  projectRemoved: {
    defaultMessage: "Project removed",
    id: "j+qma/tVWn",
    description: "Toast after a project is removed from a glossary",
  },
  loading: {
    defaultMessage: "Loading glossary...",
    id: "wZxi05pu7D",
    description: "Loading state on the glossary detail page",
  },
  notFound: {
    defaultMessage: "Glossary not found.",
    id: "NZeEWnotlt",
    description: "Empty state when a glossary cannot be found",
  },
  backToList: {
    defaultMessage: "Glossaries",
    id: "a4IAS0WZRR",
    description: "Back link from glossary detail to the list page",
  },
  sourceWorkspace: {
    defaultMessage: "Workspace",
    id: "5orwY/wNVx",
    description: "Badge for a native workspace glossary",
  },
  sourceProvider: {
    defaultMessage: "Provider",
    id: "RsvatD0q4G",
    description: "Badge for a provider-managed glossary",
  },
  localePair: {
    defaultMessage: "{sourceLocale} → {targetLocale}",
    id: "BOP4Yb+urd",
    description: "Locale pair badge on the glossary detail page",
  },
  descriptionFallback: {
    defaultMessage: "Manage terms and assign this glossary to projects.",
    id: "weWSzrQ1Qp",
    description: "Fallback description when a glossary has no description",
  },
  termsTitle: {
    defaultMessage: "Terms",
    id: "A025GrWZhB",
    description: "Section title for glossary terms",
  },
  termsDescription: {
    defaultMessage: "Add terms manually or import CSV/TBX files.",
    id: "QFfnQnu5uG",
    description: "Section description for glossary terms",
  },
  sourceTermLabel: {
    defaultMessage: "Source term",
    id: "2bzJ4YBqX2",
    description: "Label for the source term field on a glossary term form",
  },
  targetTermLabel: {
    defaultMessage: "Target term",
    id: "lOhCmO7eKl",
    description: "Label for the target term field on a glossary term form",
  },
  partOfSpeechLabel: {
    defaultMessage: "Part of speech",
    id: "r1aEK84u1V",
    description: "Label for the part of speech field on a glossary term form",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "zXcAMcp/DE",
    description: "Label for the description field on a glossary term form",
  },
  updateTerm: {
    defaultMessage: "Update term",
    id: "cpV11AmTHs",
    description: "Button to save edits to an existing glossary term",
  },
  addTerm: {
    defaultMessage: "Add term",
    id: "inRpXeF/YP",
    description: "Button to add a new glossary term",
  },
  cancelEdit: {
    defaultMessage: "Cancel edit",
    id: "eV8dpp9Cb+",
    description: "Button to cancel editing a glossary term",
  },
  editTerm: {
    defaultMessage: "Edit",
    id: "XOUlOpKBrL",
    description: "Button to edit a glossary term",
  },
  deleteTerm: {
    defaultMessage: "Delete",
    id: "ntLrh30Crw",
    description: "Button to delete a glossary term",
  },
  noTerms: {
    defaultMessage: "No terms yet.",
    id: "Nke6y6zMfg",
    description: "Empty state when a glossary has no terms",
  },
  assignedProjectsTitle: {
    defaultMessage: "Assigned projects",
    id: "SzY95cmXPi",
    description: "Section title for projects assigned to a glossary",
  },
  assignedProjectsDescription: {
    defaultMessage: "This glossary is used only by the projects listed here.",
    id: "LMGo1sN8VQ",
    description: "Section description for projects assigned to a glossary",
  },
  selectProjectPlaceholder: {
    defaultMessage: "Select project",
    id: "PtdBUhTKib",
    description: "Placeholder for the project selector on the glossary detail page",
  },
  assignToProject: {
    defaultMessage: "Assign to project",
    id: "mmfrG6qsJL",
    description: "Button to assign a project to a glossary",
  },
  removeProject: {
    defaultMessage: "Remove",
    id: "n1O3p9QRl7",
    description: "Button to remove a project from a glossary",
  },
  noProjectsAssigned: {
    defaultMessage: "No projects assigned yet.",
    id: "qhM5Koe951",
    description: "Empty state when no projects are assigned to a glossary",
  },
});
