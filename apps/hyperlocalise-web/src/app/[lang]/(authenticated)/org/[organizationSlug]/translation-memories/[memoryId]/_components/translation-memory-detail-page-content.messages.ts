"use client";

import { defineMessages } from "react-intl";

export const translationMemoryDetailPageContentMessages = defineMessages({
  loadMemoryFailed: {
    defaultMessage: "Unable to load memory",
    id: "bM4e1lioLc",
    description: "Fallback error when a translation memory fails to load",
  },
  loadEntriesFailed: {
    defaultMessage: "Unable to load entries",
    id: "62pAZqbZzL",
    description: "Fallback error when translation memory entries fail to load",
  },
  loadProjectsFailed: {
    defaultMessage: "Unable to load projects",
    id: "CdzuFVCOvh",
    description: "Fallback error when projects fail to load on the translation memory detail page",
  },
  saveEntryFailed: {
    defaultMessage: "Unable to save entry",
    id: "sMpopGaY+v",
    description: "Fallback error when saving a translation memory entry fails",
  },
  deleteEntryFailed: {
    defaultMessage: "Unable to delete entry",
    id: "qJTopaPNOi",
    description: "Fallback error when deleting a translation memory entry fails",
  },
  importEntriesFailed: {
    defaultMessage: "Unable to import entries",
    id: "6mapr/tpq/",
    description: "Fallback error when importing translation memory entries fails",
  },
  assignProjectFailed: {
    defaultMessage: "Unable to assign project",
    id: "BJVuvQezV6",
    description: "Fallback error when assigning a project to a translation memory fails",
  },
  removeProjectFailed: {
    defaultMessage: "Unable to remove project",
    id: "6/4F992ZiW",
    description: "Fallback error when removing a project from a translation memory fails",
  },
  entryUpdated: {
    defaultMessage: "Entry updated",
    id: "xo9RGrjKoZ",
    description: "Toast after a translation memory entry is updated successfully",
  },
  entryAdded: {
    defaultMessage: "Entry added",
    id: "gjDGAMSpNL",
    description: "Toast after a translation memory entry is added successfully",
  },
  entryDeleted: {
    defaultMessage: "Entry deleted",
    id: "m1KcvYGLt0",
    description: "Toast after a translation memory entry is deleted successfully",
  },
  entriesImported: {
    defaultMessage: "Imported {count, plural, one {# entry} other {# entries}}",
    id: "maIW2Vhxp8",
    description: "Toast after translation memory entries are imported from a file",
  },
  projectAssigned: {
    defaultMessage: "Project assigned",
    id: "vNt29KgOjZ",
    description: "Toast after a project is assigned to a translation memory",
  },
  projectRemoved: {
    defaultMessage: "Project removed",
    id: "HQcx54morj",
    description: "Toast after a project is removed from a translation memory",
  },
  loading: {
    defaultMessage: "Loading memory...",
    id: "NIQqFjDS2n",
    description: "Loading state on the translation memory detail page",
  },
  notFound: {
    defaultMessage: "Translation memory not found.",
    id: "oNrNYjWrTm",
    description: "Empty state when a translation memory cannot be found",
  },
  backToList: {
    defaultMessage: "Translation memories",
    id: "p/sianUEpZ",
    description: "Back link from translation memory detail to the list page",
  },
  sourceWorkspace: {
    defaultMessage: "Workspace",
    id: "6qYMXPCPow",
    description: "Badge for a native workspace translation memory",
  },
  sourceProvider: {
    defaultMessage: "Provider",
    id: "7XjHYDDsku",
    description: "Badge for a provider-managed translation memory",
  },
  descriptionFallback: {
    defaultMessage: "Manage translation examples and assign this memory to projects.",
    id: "5f3K9erV3R",
    description: "Fallback description when a translation memory has no description",
  },
  entriesTitle: {
    defaultMessage: "Entries",
    id: "v9fZNKaoQo",
    description: "Section title for translation memory entries",
  },
  entriesDescription: {
    defaultMessage: "Add aligned source and target examples manually or import CSV/TMX files.",
    id: "/enSUmEMs6",
    description: "Section description for translation memory entries",
  },
  sourceLocaleLabel: {
    defaultMessage: "Source locale",
    id: "8dycmh+dlE",
    description: "Label for the source locale field on a translation memory entry form",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "A24FO+oAD8",
    description: "Label for the target locale field on a translation memory entry form",
  },
  sourceTextLabel: {
    defaultMessage: "Source text",
    id: "O3OXLAres/",
    description: "Label for the source text field on a translation memory entry form",
  },
  targetTextLabel: {
    defaultMessage: "Target text",
    id: "pFVKHpG8Q4",
    description: "Label for the target text field on a translation memory entry form",
  },
  updateEntry: {
    defaultMessage: "Update entry",
    id: "mbBE7MN8aB",
    description: "Button to save edits to an existing translation memory entry",
  },
  addEntry: {
    defaultMessage: "Add entry",
    id: "Zb2NG5FzSq",
    description: "Button to add a new translation memory entry",
  },
  cancelEdit: {
    defaultMessage: "Cancel edit",
    id: "Rlnuzntk1P",
    description: "Button to cancel editing a translation memory entry",
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
  noEntries: {
    defaultMessage: "No entries yet.",
    id: "nYl8yPSIEu",
    description: "Empty state when a translation memory has no entries",
  },
  localePair: {
    defaultMessage: "{sourceLocale} → {targetLocale}",
    id: "BjVwBrTuYP",
    description: "Locale pair shown under a translation memory entry",
  },
  assignedProjectsTitle: {
    defaultMessage: "Assigned projects",
    id: "4JNFWAJU6o",
    description: "Section title for projects assigned to a translation memory",
  },
  assignedProjectsDescription: {
    defaultMessage: "This memory is used only by the projects listed here.",
    id: "ww1ZEpMIQj",
    description: "Section description for projects assigned to a translation memory",
  },
  selectProjectPlaceholder: {
    defaultMessage: "Select project",
    id: "6Rp9Bt8T/L",
    description: "Placeholder for the project selector on the translation memory detail page",
  },
  assignToProject: {
    defaultMessage: "Assign to project",
    id: "RtWhSzVewJ",
    description: "Button to assign a project to a translation memory",
  },
  removeProject: {
    defaultMessage: "Remove",
    id: "VLmrLDJXnd",
    description: "Button to remove a project from a translation memory",
  },
  noProjectsAssigned: {
    defaultMessage: "No projects assigned yet.",
    id: "Fqhf+2LVu/",
    description: "Empty state when no projects are assigned to a translation memory",
  },
});
