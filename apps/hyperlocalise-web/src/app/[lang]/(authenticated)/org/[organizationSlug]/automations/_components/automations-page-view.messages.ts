"use client";

import { defineMessages } from "react-intl";

export const automationsPageViewMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Workspace",
    id: "22cLivfsp0",
    description: "Automations page header eyebrow label",
  },
  pageTitle: {
    defaultMessage: "Automations",
    id: "hScQeR54rc",
    description: "Automations page heading",
  },
  pageDescription: {
    defaultMessage:
      "Automate repetitive tasks with always-on workflows that respond to schedules and GitHub pushes.",
    id: "9xPbF7DCJr",
    description: "Automations page description under the heading",
  },
  newAutomation: {
    defaultMessage: "New Automation",
    id: "1um5cM9poq",
    description: "Button to create a new workspace automation",
  },
  loadingAutomations: {
    defaultMessage: "Loading automations",
    id: "o1Kg4Vat6I",
    description: "Accessible label while the automations list is loading",
  },
  totalAutomations: {
    defaultMessage: "Total automations",
    id: "LWbZAQ/S/H",
    description: "Stat card label for total automation count",
  },
  activeCount: {
    defaultMessage: "Active",
    id: "SluNUViHRX",
    description: "Stat card label for active automation count",
  },
  pausedCount: {
    defaultMessage: "Paused",
    id: "zxNwuNh3O4",
    description: "Stat card label for paused automation count",
  },
  columnAutomation: {
    defaultMessage: "Automation",
    id: "phMXmlQCix",
    description: "Automations list column header for name",
  },
  columnTools: {
    defaultMessage: "Tools",
    id: "DWXDNH6bM+",
    description: "Automations list column header for tools",
  },
  columnStatus: {
    defaultMessage: "Status",
    id: "g/SyG0phTI",
    description: "Automations list column header for status",
  },
  columnCreated: {
    defaultMessage: "Created",
    id: "z5k8iKEIXN",
    description: "Automations list column header for created date",
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
  emptyList: {
    defaultMessage: "No automations yet. Start from a template below or create a new automation.",
    id: "Z7EtcHtkyS",
    description: "Empty state when the workspace has no automations",
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
  templatesTitle: {
    defaultMessage: "Templates",
    id: "EGX8+adWDn",
    description: "Section heading for automation templates",
  },
  templatesDescription: {
    defaultMessage:
      "Start from a curated workflow. Templates prefill the creation form with instructions, triggers, and tools.",
    id: "HTsdqd2HP4",
    description: "Section description for automation templates",
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
  addTemplate: {
    defaultMessage: "Add",
    id: "rIuVU6iths",
    description: "Button to create an automation from a template",
  },
  comingSoon: {
    defaultMessage: "Coming soon",
    id: "Oyb9LX/sl2",
    description: "Disabled button when a template is not yet activatable",
  },
});
