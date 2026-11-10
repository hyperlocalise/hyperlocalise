"use client";

import { defineMessages } from "react-intl";

export const guidelineAssignmentsMessages = defineMessages({
  title: {
    defaultMessage: "Assign to projects",
    id: "VoW1u80V5k",
    description: "Title for the workspace guideline project assignment page",
  },
  description: {
    defaultMessage:
      "Org-scoped guidelines apply to every project unless you select specific projects.",
    id: "UFnpymWErV",
    description: "Description for the guideline assignment page",
  },
  backToGuideline: {
    defaultMessage: "Back to Guideline",
    id: "2Vbjc7dInq",
    description: "Link back to the workspace Guideline page",
  },
  workspaceNote: {
    defaultMessage: "Typed workspace note",
    id: "j0NM4xi9du",
    description: "Row label for the typed workspace guideline note",
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
  uploads: {
    defaultMessage: "Org-wide uploads",
    id: "LqgSgKlVNI",
    description: "Section title for org-wide uploaded guideline documents",
  },
  noUploads: {
    defaultMessage: "No org-wide uploads yet.",
    id: "kbOifYsiMg",
    description: "Empty state when there are no org-wide guideline documents",
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
    defaultMessage: "Remove",
    id: "XJmIbeJegZ",
    description: "Remove a project assignment",
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
