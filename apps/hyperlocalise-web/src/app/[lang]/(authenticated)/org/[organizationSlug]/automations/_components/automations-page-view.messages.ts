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

export const automationsPageViewMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Workspace",
    id: "22cLivfsp0",
    description: "Automations page header eyebrow label",
  },
  pageLabelProject: {
    defaultMessage: "Project",
    id: "+WMW4vljPC",
    description: "Project automations page header eyebrow label",
  },
  pageTitle: {
    defaultMessage: "Automations",
    id: "hScQeR54rc",
    description: "Automations page heading",
  },
  newAutomation: {
    defaultMessage: "New automation",
    id: "RkEdGugJ9D",
    description: "Button to create a new workspace automation",
  },
  loadingAutomations: {
    defaultMessage: "Loading automations",
    id: "o1Kg4Vat6I",
    description: "Accessible label while the automations list is loading",
  },
  columnAutomation: {
    defaultMessage: "Automation",
    id: "phMXmlQCix",
    description: "Automations list column header for name",
  },
  columnStatus: {
    defaultMessage: "Status",
    id: "g/SyG0phTI",
    description: "Automations list column header for status",
  },
  columnType: {
    defaultMessage: "Type",
    id: "1qL0M/R6/C",
    description: "Automations list column header for whether a row is an agent or a workflow",
  },
  columnLastRun: {
    defaultMessage: "Last run",
    id: "MKBXn3R7sQ",
    description: "Automations list column header for when the automation last ran",
  },
  typeAgent: {
    defaultMessage: "Agent",
    id: "EivWPiu4Ba",
    description:
      "Type of automation where an AI agent works out the steps from plain-language instructions",
  },
  typeWorkflow: {
    defaultMessage: "Workflow",
    id: "mxeQQYVS7G",
    description: "Type of automation whose steps are drawn on a canvas",
  },
  statusDraft: {
    defaultMessage: "Draft",
    id: "GDAIerdtbH",
    description: "Badge label when a workflow has not been published yet",
  },
  filterAll: {
    defaultMessage: "All",
    id: "8mDbUiZ1Lc",
    description: "Status filter tab on the automations list that shows every automation",
  },
  filterAllTypes: {
    defaultMessage: "All types",
    id: "6prHltOLvc",
    description: "Type filter option on the automations list that shows agents and workflows",
  },
  filterTypeLabel: {
    defaultMessage: "Type",
    id: "VQ6A5NjwLq",
    description: "Accessible label of the type filter on the automations list",
  },
  filterStatusLabel: {
    defaultMessage: "Status",
    id: "9U7m22JnTL",
    description: "Accessible label of the status filter tabs on the automations list",
  },
  filterCount: {
    defaultMessage: "{label} {count}",
    id: "8P/z8xum8r",
    description: "Status filter tab with the number of automations it shows, for example Active 3",
  },
  searchPlaceholder: {
    defaultMessage: "Search automations",
    id: "D9w64PZ8DL",
    description: "Placeholder and accessible label of the search box on the automations list",
  },
  noMatches: {
    defaultMessage: "No automations match these filters.",
    id: "yfNXwfVcU8",
    description: "Shown when the automations list filters or search hide every row",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "SKbYojGGbi",
    description: "Button that resets the search and filters on the automations list",
  },
  lastRunNever: {
    defaultMessage: "Never",
    id: "Uo4rwaI5U9",
    description: "Last run cell when an automation has not run yet",
  },
  lastRunRunning: {
    defaultMessage: "Running",
    id: "DtYQFpxh2B",
    description: "Last run cell when an automation is running or queued right now",
  },
  lastRunFailed: {
    defaultMessage: "Failed · {time}",
    id: "BjQAa4J39T",
    description: "Last run cell when the latest run failed; time is how long ago, for example 2h",
  },
  lastRunUnavailable: {
    defaultMessage: "Open to see runs",
    id: "3IL4ds7P3n",
    description:
      "Accessible text for the empty last run cell of a workflow, whose runs are listed on its canvas",
  },
  emptyTitle: {
    defaultMessage: "Put your localisation work on autopilot",
    id: "xCczpLAZTo",
    description: "Title of the automations page when the workspace has no automations",
  },
  emptyDescription: {
    defaultMessage: "An automation runs when something happens and does the work for you.",
    id: "PAUs1XBHgW",
    description: "Text under the title of the automations page when there are no automations",
  },
  conceptWhen: {
    defaultMessage: "When",
    id: "U4uH7q/yor",
    description: "First part of the automation explainer: what starts an automation",
  },
  conceptWhenExample: {
    defaultMessage: "A pull request opens, a file is uploaded, every Monday",
    id: "e5VJtY23cB",
    description: "Examples of what starts an automation, in the automation explainer",
  },
  conceptDo: {
    defaultMessage: "Do",
    id: "Zc38cqbqcd",
    description: "Second part of the automation explainer: the work an automation does",
  },
  conceptDoExample: {
    defaultMessage: "Review, translate, check quality, write a report",
    id: "RxGgbJ88Yv",
    description: "Examples of the work an automation does, in the automation explainer",
  },
  conceptUsing: {
    defaultMessage: "Using",
    id: "6bhIe+GhSd",
    description: "Third part of the automation explainer: the tools an automation uses",
  },
  conceptUsingExample: {
    defaultMessage: "GitHub, Slack, Contentful, email and more",
    id: "c803NwvdUl",
    description: "Examples of the tools an automation uses, in the automation explainer",
  },
  browseWaysToStart: {
    defaultMessage: "Browse templates",
    id: "GSz/D4JeXe",
    description:
      "Link from the empty automations page to the page with templates and build options",
  },
  loadError: {
    defaultMessage: "Automations failed to load.",
    id: "qfAtSAXlkS",
    description: "Error title when the automations list request fails",
  },
  loadErrorFallback: {
    defaultMessage: "Refresh the page to try again.",
    id: "XMW6IBe3PH",
    description: "Fallback error description when no API message is available",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "MyhfQjH0sE",
    description: "Badge label when an automation is active",
  },
  statusPaused: {
    defaultMessage: "Paused",
    id: "+5c87/Ii+m",
    description: "Badge label when an automation is paused",
  },
  categoryPopular: {
    defaultMessage: "Popular",
    id: "EJdAEUdkMf",
    description: "Template category filter tab for popular templates",
  },
  categorySourceContent: {
    defaultMessage: "Source Content",
    id: "DI7vTror/h",
    description: "Template category filter tab for source content templates",
  },
  categoryMarketing: {
    defaultMessage: "Marketing",
    id: "H/CmKBQumj",
    description: "Template category filter tab for marketing templates",
  },
  categoryTranslationDelivery: {
    defaultMessage: "Translation Delivery",
    id: "jCORO6tbhT",
    description: "Template category filter tab for translation delivery templates",
  },
  categoryQuality: {
    defaultMessage: "Quality",
    id: "QZITZRdJzR",
    description: "Template category filter tab for quality templates",
  },
  categoryRelease: {
    defaultMessage: "Release Readiness",
    id: "EvF3cGlK0a",
    description: "Template category filter tab for release readiness templates",
  },
  comingSoon: {
    defaultMessage: "Coming soon",
    id: "lHdvBQ5B1/",
    description: "Badge when a template is not yet activatable",
  },
});
