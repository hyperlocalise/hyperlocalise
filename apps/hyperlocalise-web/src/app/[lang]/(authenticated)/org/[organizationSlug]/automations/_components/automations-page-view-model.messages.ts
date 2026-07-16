"use client";

import { defineMessages } from "react-intl";

export const automationsPageViewModelMessages = defineMessages({
  relativeHours: {
    defaultMessage: "{hours}h",
    id: "F/BtD1KZKq",
    description: "Relative age of an automation created less than a day ago",
  },
  relativeDays: {
    defaultMessage: "{days}d",
    id: "BFQt98qExR",
    description: "Relative age of an automation created one or more days ago",
  },
  triggerScheduled: {
    defaultMessage: "Scheduled",
    id: "MXyOWGXSz8",
    description: "Trigger label for a scheduled automation in the list",
  },
  triggerGithub: {
    defaultMessage: "GitHub push",
    id: "uycq9iF49K",
    description: "Trigger label for a GitHub push automation in the list",
  },
  triggerManual: {
    defaultMessage: "Manual",
    id: "sbr8qd8WgZ",
    description: "Trigger label for a manual automation in the list",
  },
  toolGithub: {
    defaultMessage: "GitHub",
    id: "LKQXtMkDON",
    description: "Tool badge when an automation uses GitHub",
  },
  toolSlack: {
    defaultMessage: "Slack",
    id: "y5oeiThV/6",
    description: "Tool badge when an automation uses Slack",
  },
  toolEmail: {
    defaultMessage: "Email",
    id: "6QqDATp4yt",
    description: "Tool badge when an automation uses email",
  },
});
