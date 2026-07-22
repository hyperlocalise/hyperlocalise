"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const projectsPageContentMessages = defineMessages({
  recentlyOpened: {
    defaultMessage: "Recently opened",
    id: "ra0EyftjV0",
    description: "Heading above the recently opened projects strip",
  },
  loadProjectsFailed: {
    defaultMessage: "Failed to load projects",
    id: "ItrnRpF69X",
    description: "Fallback error when native projects fail to load",
  },
  createProjectFailed: {
    defaultMessage: "Unable to create project",
    id: "PqqKKd0E77",
    description: "Fallback error when creating a project fails",
  },
  updateProjectFailed: {
    defaultMessage: "Unable to update project",
    id: "8cCnIQ+Lhz",
    description: "Fallback error when updating a project fails",
  },
  deleteProjectFailed: {
    defaultMessage: "Unable to delete project",
    id: "GOImV2QS+V",
    description: "Fallback error when deleting a project fails",
  },
  projectCreated: {
    defaultMessage: "Project created",
    id: "rzRd9sk8q6",
    description: "Toast after a project is created successfully",
  },
  projectUpdated: {
    defaultMessage: "Project updated",
    id: "cgByBDP5Dl",
    description: "Toast after a project is updated successfully",
  },
  projectDeleted: {
    defaultMessage: "Project deleted",
    id: "2lMmWOEFYn",
    description: "Toast after a project is deleted successfully",
  },
  editProjectTitle: {
    defaultMessage: "Edit project",
    id: "lySN7MFYwz",
    description: "Title of the edit project dialog",
  },
  createProjectTitle: {
    defaultMessage: "Create project",
    id: "DFNppqOCak",
    description: "Title of the create project dialog",
  },
  editProjectDescription: {
    defaultMessage: "Update the metadata stored with this project.",
    id: "GeD3IIa8Fg",
    description: "Description of the edit project dialog",
  },
  createProjectDescription: {
    defaultMessage: "Add a project to track localization work and shared translation guidance.",
    id: "5nqOLfQ5J8",
    description: "Description of the create project dialog",
  },
  tmsFallbackName: {
    defaultMessage: "TMS",
    id: "aKIe8yWjB3",
    description: "Fallback label when no TMS provider name is available",
  },
  pageDescriptionWithTms: {
    defaultMessage:
      "Browse live {providerName} projects and manage Hyperlocalise workspace projects.",
    id: "MOJri1ONT9",
    description: "Projects page description when a TMS provider is connected",
  },
  pageDescriptionWithoutTms: {
    defaultMessage:
      "Browse Hyperlocalise projects. Connect a TMS provider to view live provider projects alongside them.",
    id: "HrQO2GGbYJ",
    description: "Projects page description when no TMS provider is connected",
  },
  createNativeProject: {
    defaultMessage: "Create native project",
    id: "zKYGdX/fFA",
    description: "Secondary button to create a Hyperlocalise-native project",
  },
  createProject: {
    defaultMessage: "Create project",
    id: "mjXFArSK6C",
    description: "Primary button to create a project",
  },
  tmsProjectsTitle: {
    defaultMessage: "{providerName} projects",
    id: "c3ROZAXotz",
    description: "Section title for live TMS provider projects",
  },
  tmsProjectsDescription: {
    defaultMessage:
      "Live projects fetched from your connected TMS provider, ordered by recent activity.",
    id: "prJEYrujJH",
    description: "Section description for live TMS provider projects",
  },
  hyperlocaliseProjectsTitle: {
    defaultMessage: "Hyperlocalise projects",
    id: "JRvnN6Kkq8",
    description: "Section title for native Hyperlocalise projects",
  },
  hyperlocaliseProjectsDescription: {
    defaultMessage: "Projects created and managed in this workspace.",
    id: "BHCGhKF/Fb",
    description: "Section description for native Hyperlocalise projects",
  },
  connectTmsTitle: {
    defaultMessage: "TMS projects",
    id: "jNNp9OLKEA",
    description: "Section title prompting the user to connect a TMS provider",
  },
  connectTmsDescription: {
    defaultMessage: "Connect a TMS provider to browse live provider projects here.",
    id: "oU0PK0wDMT",
    description: "Section description prompting the user to connect a TMS provider",
  },
  connectProvider: {
    defaultMessage: "Connect a provider",
    id: "hfzLE9ZrP4",
    description: "Button linking to integrations to connect a TMS provider",
  },
  pageLabel: {
    defaultMessage: "Workspace",
    id: "Pgxv//ij4N",
    description: "Projects page header eyebrow label",
  },
  pageTitle: {
    defaultMessage: "Projects",
    id: "WE7a6RlfNZ",
    description: "Projects page heading",
  },
  searchLabel: {
    defaultMessage: "Search",
    id: "M09MwVsnwY",
    description: "Label for the projects search field",
  },
  searchPlaceholder: {
    defaultMessage: "Search by name...",
    id: "nSqpG2XwMB",
    description: "Placeholder for the projects search field",
  },
  filterAll: {
    defaultMessage: "All",
    id: "F25y8G/ydQ",
    description: "Tab to show all project sources",
  },
  filterHyperlocalise: {
    defaultMessage: "Hyperlocalise",
    id: "b/Vd04dNDW",
    description: "Tab to show only Hyperlocalise-native projects",
  },
  noSearchResults: {
    defaultMessage: "No projects match your search. <clear>Clear search</clear>",
    id: "2/tGcgvmb8",
    description: "Empty state when the project search returns no results, with clear action",
  },
});
