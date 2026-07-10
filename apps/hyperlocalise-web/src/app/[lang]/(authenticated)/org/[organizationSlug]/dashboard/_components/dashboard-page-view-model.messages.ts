"use client";

import { defineMessages } from "react-intl";

export const dashboardPageViewModelMessages = defineMessages({
  tmsFallbackLabel: {
    defaultMessage: "Translation management",
    id: "Mi2Q/CduVa",
    description: "Default TMS integration label when no provider is connected",
  },
  tmsConnectedDescription: {
    defaultMessage: "{providerName} projects and translation work are available.",
    id: "KPIIspKW7R",
    description: "Dashboard integration description when a TMS provider is connected",
  },
  tmsDisconnectedDescription: {
    defaultMessage: "Connect Crowdin, Lokalise, Phrase, or Smartling.",
    id: "Eakafmv8Gv",
    description: "Dashboard integration description when no TMS provider is connected",
  },
  githubLabel: {
    defaultMessage: "GitHub",
    id: "nQSI1fGvRy",
    description: "GitHub integration label on the dashboard",
  },
  githubDescription: {
    defaultMessage: "Sync localized strings and run validation on push.",
    id: "f+cpbxZH+C",
    description: "GitHub integration description on the dashboard",
  },
  slackLabel: {
    defaultMessage: "Slack",
    id: "2JWP4PXKxL",
    description: "Slack integration label on the dashboard",
  },
  slackDescription: {
    defaultMessage: "Get review notifications and agent handoffs in Slack.",
    id: "+xuw6xgQgo",
    description: "Slack integration description on the dashboard",
  },
  setupHeroTitle: {
    defaultMessage: "Get your workspace ready",
    id: "ree/WWv9H5",
    description: "Dashboard setup hero title before workspace is fully configured",
  },
  setupHeroDescription: {
    defaultMessage:
      "Connect your tools and create a project so Hyperlocalise can route translation work to you.",
    id: "gPLqwOpbOB",
    description: "Dashboard setup hero description before workspace is fully configured",
  },
  setupHeroCta: {
    defaultMessage: "Finish setup",
    id: "6rnWouvhAd",
    description: "Dashboard setup hero call-to-action label",
  },
  caughtUpHeroTitle: {
    defaultMessage: "You’re all caught up",
    id: "2eU5akyXs2",
    description: "Dashboard hero title when there are no pending actions",
  },
  caughtUpHeroDescription: {
    defaultMessage:
      "No pending actions right now. Start a new request or browse projects when you’re ready to continue.",
    id: "2mcGAlQ7te",
    description: "Dashboard hero description when there are no pending actions",
  },
  newRequestCta: {
    defaultMessage: "New request",
    id: "yKtWAeejtx",
    description: "Dashboard call-to-action to start a new localization request",
  },
  attentionHeroTitle: {
    defaultMessage: "A few things need your attention",
    id: "xOFZqYtkn0",
    description: "Dashboard hero title when pending actions need review",
  },
  attentionHeroDescription: {
    defaultMessage:
      "{count, plural, one {# pending action across your workspace.} other {# pending actions across your workspace.}}",
    id: "Ll8TcrApq9",
    description: "Dashboard hero description with pending action count",
  },
  viewMyJobsCta: {
    defaultMessage: "View my jobs",
    id: "OUgvJN+For",
    description: "Dashboard call-to-action to open assigned jobs",
  },
  nativeSourceLabel: {
    defaultMessage: "Native",
    id: "WSbyg2v11q",
    description: "Source label for Hyperlocalise-native projects on the dashboard",
  },
  automationFallbackName: {
    defaultMessage: "Automation",
    id: "ebI/JnzL7S",
    description: "Fallback name when an automation run’s automation is missing",
  },
});
