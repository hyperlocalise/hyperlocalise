"use client";

import { defineMessages } from "react-intl";

export const slackIntegrationRowMessages = defineMessages({
  name: {
    defaultMessage: "Slack",
    id: "A6g1n+wasr",
    description: "Slack integration name on the integrations page",
  },
  loadErrorDescription: {
    defaultMessage: "Unable to load Slack settings right now.",
    id: "5bWs0pTrNJ",
    description: "Slack integration row description when settings fail to load",
  },
  disconnectedDescription: {
    defaultMessage:
      "Coordinate localization reviews from Slack mentions, DMs, and subscribed threads.",
    id: "0bosLZsKFI",
    description: "Slack integration description before OAuth connection",
  },
  settingsUnavailable: {
    defaultMessage: "Settings unavailable",
    id: "k0oDzsZOu6",
    description: "Slack agent panel title when settings failed to load",
  },
  workspaceId: {
    defaultMessage: "Workspace ID: {teamId}",
    id: "goHDd0IC3Q",
    description: "Slack workspace identifier shown in the agent settings panel",
  },
  enableSlackAgentAriaLabel: {
    defaultMessage: "Enable Slack agent",
    id: "rYXZcW+sgJ",
    description: "Aria label for the Slack agent enable switch",
  },
  openingSlack: {
    defaultMessage: "Opening Slack…",
    id: "uGl99aLDiP",
    description: "Primary action label while redirecting to Slack OAuth",
  },
  updating: {
    defaultMessage: "Updating…",
    id: "OY8OoRp1g9",
    description: "Disable button label while Slack agent state is saving",
  },
  disable: {
    defaultMessage: "Disable",
    id: "RBvXfLqDOK",
    description: "Button label to disable the Slack agent",
  },
  installUrlFailedToast: {
    defaultMessage: "Failed to generate Slack install URL",
    id: "b1jBVJ44Vr",
    description: "Toast when Slack OAuth install URL generation fails",
  },
  connectedToast: {
    defaultMessage: "Slack connected",
    id: "k8bxVI/FQf",
    description: "Toast after returning from successful Slack OAuth",
  },
  enabledToast: {
    defaultMessage: "Slack agent enabled",
    id: "/zPj/3x/+q",
    description: "Toast after enabling the Slack agent",
  },
  disabledToast: {
    defaultMessage: "Slack agent disabled",
    id: "gso6nAA1gq",
    description: "Toast after disabling the Slack agent",
  },
});
