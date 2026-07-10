"use client";

import { defineMessages } from "react-intl";

export const appShellNavigationMessages = defineMessages({
  allProjects: {
    defaultMessage: "All projects",
    id: "SUXI1fXBfn",
    description: "Sidebar link to return from a project to the projects list",
  },
  projectSection: {
    defaultMessage: "Project",
    id: "73pQzYGwei",
    description: "Sidebar section label above the current project name and project nav items",
  },
  projectFallbackName: {
    defaultMessage: "Project",
    id: "E2040akAix",
    description: "Fallback project name in the sidebar while the project is loading",
  },
  badgeSeparator: {
    defaultMessage: "{label} · {badge}",
    id: "90L8I4Y/Gl",
    description: "Sidebar tooltip combining a navigation item label and its badge",
  },
});
