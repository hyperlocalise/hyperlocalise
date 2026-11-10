import { defineMessages } from "react-intl";

export const guidelineDocumentAssignmentsMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Projects",
    id: "ZJhPtQTx1U",
    description: "Section title for per-document project assignments",
  },
  sectionDescription: {
    defaultMessage:
      "Unassigned org-wide documents apply to every project. Select specific projects to scope this document down.",
    id: "oHs8rf1U7k",
    description: "Description for per-document project assignments",
  },
  noProjects: {
    defaultMessage: "All projects",
    id: "8w+jrEv9vl",
    description: "Badge when a guideline applies to every project (no assignment yet)",
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
