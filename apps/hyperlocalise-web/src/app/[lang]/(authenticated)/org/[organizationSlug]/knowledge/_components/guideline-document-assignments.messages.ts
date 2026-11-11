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

export const guidelineDocumentAssignmentsMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Projects",
    id: "ZJhPtQTx1U",
    description: "Section title for per-document project assignments",
  },
  sectionDescription: {
    defaultMessage:
      "Unassigned documents apply to no project. Turn on All projects or assign specific projects to scope this document.",
    id: "5vT3Efe6qS",
    description: "Description for per-document project assignments",
  },
  noProjects: {
    defaultMessage: "No projects",
    id: "qY3Pg1S0PG",
    description: "Badge when a guideline applies to no project",
  },
  allProjects: {
    defaultMessage: "All projects",
    id: "sgEffgFAQO",
    description: "Badge when a guideline applies to every project",
  },
  selectedProjects: {
    defaultMessage: "{count, plural, one {# project} other {# projects}}",
    id: "0jMUHyL955",
    description: "Badge when a guideline applies to selected projects",
  },
  selectProject: {
    defaultMessage: "Select a project",
    id: "sND7XTxqIV",
    description: "Placeholder for the project picker",
  },
  assign: {
    defaultMessage: "Assign",
    id: "ME7oVCs6tD",
    description: "Assign a guideline to a project",
  },
  remove: {
    defaultMessage: "Unassign",
    id: "n7UnasgK2p",
    description: "Unassign a project from this guideline",
  },
  loadFailed: {
    defaultMessage: "Could not load assignments.",
    id: "+Hg4XksdX1",
    description: "Error when assignment data fails to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "0DIbZhFGv/",
    description: "Retry loading assignments",
  },
  assignFailed: {
    defaultMessage: "Could not assign the project.",
    id: "PGszZ1zTVn",
    description: "Error when attaching a project fails",
  },
  removeFailed: {
    defaultMessage: "Could not remove the project.",
    id: "OgnnBKgUgj",
    description: "Error when detaching a project fails",
  },
});
