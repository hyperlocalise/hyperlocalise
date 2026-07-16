"use client";

import { defineMessages } from "react-intl";

export const projectsTableMessages = defineMessages({
  nativeEmptyCompact: {
    defaultMessage:
      "No Hyperlocalise projects yet. <action>Create one</action> to add translation context and job tracking.",
    id: "tFwg80J8SU",
    description: "Compact empty state for Hyperlocalise projects with a create action link",
  },
  nativeEmptyTitle: {
    defaultMessage: "Create your first localization project",
    id: "eq+MOWqVs2",
    description: "Title of the empty state when there are no Hyperlocalise projects",
  },
  nativeEmptyDescription: {
    defaultMessage:
      "Track source content, release ownership, and translation context before work moves into translation jobs.",
    id: "0M4iVzJdHy",
    description: "Description of the empty state when there are no Hyperlocalise projects",
  },
  hyperlocaliseProvider: {
    defaultMessage: "Hyperlocalise",
    id: "ESaaPFjV43",
    description: "Provider label for native Hyperlocalise projects on project cards",
  },
  inactiveBadge: {
    defaultMessage: "Inactive",
    id: "6hZ0OrRvp2",
    description: "Badge shown on inactive project cards",
  },
  noDescriptionYet: {
    defaultMessage: "No description yet",
    id: "RSCu8OSDph",
    description: "Fallback text when a project card has no description",
  },
  openInProviderSrOnly: {
    defaultMessage: "Open {projectName} in provider",
    id: "h3qjecOeg8",
    description: "Screen-reader label for opening a project in its external TMS provider",
  },
  openInProvider: {
    defaultMessage: "Open in {providerName}",
    id: "V0ZxKR31oY",
    description: "Tooltip for opening a project in its external TMS provider",
  },
  actionsForProject: {
    defaultMessage: "Actions for {projectName}",
    id: "/0aHJPSP9g",
    description: "Accessible label for the project card actions menu",
  },
  openProject: {
    defaultMessage: "Open project",
    id: "SUwoew7bqk",
    description: "Menu item to open a project",
  },
  editProject: {
    defaultMessage: "Edit project...",
    id: "g7kCok/oT0",
    description: "Menu item to edit a project",
  },
  deleteProject: {
    defaultMessage: "Delete project...",
    id: "eEy5UfpPzO",
    description: "Menu item to delete a project",
  },
  localesLabel: {
    defaultMessage: "Locales",
    id: "LHjP+HTMcQ",
    description: "Project card metadata label for locales",
  },
  openJobsLabel: {
    defaultMessage: "Open jobs",
    id: "1/Eg78Gi+a",
    description: "Project card metadata label for open jobs",
  },
  openJobsCount: {
    defaultMessage: "{count, plural, one {# job} other {# jobs}}",
    id: "TKzoXsQ+7N",
    description: "Count of open jobs on a project card",
  },
  noOpenJobs: {
    defaultMessage: "None",
    id: "TEhuWyiC97",
    description: "Shown when a project has no open jobs",
  },
  updatedLabel: {
    defaultMessage: "Updated",
    id: "gzw597zx6d",
    description: "Project card metadata label for last updated time",
  },
  updatedUnavailable: {
    defaultMessage: "Updated date unavailable",
    id: "dcbWLpn6f2",
    description: "Fallback when a project has no usable updated timestamp",
  },
  emptyTmsTitle: {
    defaultMessage: "No TMS projects found",
    id: "LskMKNMd3j",
    description: "Title when the TMS projects list is empty",
  },
  emptyTmsDescription: {
    defaultMessage:
      "Your provider connection is active, but no projects were returned from the live API.",
    id: "DBBFqQ55km",
    description: "Description when the TMS projects list is empty",
  },
  loadingProjects: {
    defaultMessage: "Loading projects",
    id: "vGGfZ3wAHV",
    description: "Accessible label while project cards are loading",
  },
  loadFailedTitle: {
    defaultMessage: "Projects failed to load.",
    id: "4x93Ph/+pf",
    description: "Error title when the projects list fails to load",
  },
  loadFailedFallback: {
    defaultMessage: "Refresh the page to try again.",
    id: "xy0kgWsXSb",
    description: "Fallback error detail when projects fail to load without a message",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "C31IoV3z9k",
    description: "Button to load more projects in the list",
  },
});
