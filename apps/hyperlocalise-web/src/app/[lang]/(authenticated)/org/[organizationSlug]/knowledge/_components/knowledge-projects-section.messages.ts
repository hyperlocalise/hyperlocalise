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

export const knowledgeProjectsSectionMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Projects",
    id: "ukI95H7zrU",
    description: "Heading for project style guides and guidelines on the workspace Guideline page",
  },
  sectionDescription: {
    defaultMessage:
      "Style guides and project guidelines used in the editor and workflows. Open a project to edit.",
    id: "J5q0R+rIqK",
    description: "Description for the project list on the workspace Guideline page",
  },
  columnProject: {
    defaultMessage: "Project",
    id: "7MwPWNHU6i",
    description: "Table column header for project name",
  },
  columnStyleGuide: {
    defaultMessage: "Style guide",
    id: "J1uo+B3Tlk",
    description: "Table column header for project style guide excerpt",
  },
  columnProjectGuideline: {
    defaultMessage: "Project guideline",
    id: "5R6QcLONiw",
    description: "Table column header for project Memory.md guideline excerpt",
  },
  emptyStyleGuide: {
    defaultMessage: "None",
    id: "d40ArqT2MH",
    description: "Placeholder when a project has no style guide text",
  },
  emptyProjectGuideline: {
    defaultMessage: "None",
    id: "T4a97PcYOc",
    description: "Placeholder when a project has no project guideline text",
  },
  openProjectGuideline: {
    defaultMessage: "Open",
    id: "Y75fqcWKkh",
    description: "Link to open the project guideline page",
  },
  openStyleGuideSettings: {
    defaultMessage: "Settings",
    id: "8eKSmbjV/2",
    description: "Link to open project settings for the style guide",
  },
  loadError: {
    defaultMessage: "Unable to load projects.",
    id: "VqzRqESv1z",
    description: "Error when the project guideline list fails to load",
  },
  loading: {
    defaultMessage: "Loading projects…",
    id: "g0dGJ5GihM",
    description: "Loading state for the project guideline list",
  },
  noProjects: {
    defaultMessage: "No projects yet.",
    id: "zuy5sLgN2Q",
    description: "Empty state when the organization has no projects",
  },
});
