"use client";

import { defineMessages } from "react-intl";

export const guidelineAssignmentsMessages = defineMessages({
  title: {
    defaultMessage: "Assign to projects",
    id: "U3khFjoOoZ",
    description: "Title for the guideline document assignment page",
  },
  description: {
    defaultMessage:
      "Org-scoped guideline documents apply to every project unless you select specific projects.",
    id: "PL0HtnBEiw",
    description: "Description for the guideline assignment page",
  },
  backToGuideline: {
    defaultMessage: "Back to Guideline",
    id: "APcdnMv7h1",
    description: "Link back to the Guideline page",
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
  documents: {
    defaultMessage: "Org-wide documents",
    id: "LXGU9NstON",
    description: "Section title for org-wide guideline documents",
  },
  noDocuments: {
    defaultMessage: "No org-wide documents yet.",
    id: "2X2wVWJ9Bz",
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
