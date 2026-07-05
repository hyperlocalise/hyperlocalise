"use client";

import { defineMessages } from "react-intl";

export const slackAgentViewModelMessages = defineMessages({
  connectedBadge: {
    defaultMessage: "Connected",
    id: "ZmMPE/eod1",
    description: "Slack integration badge when a workspace is linked",
  },
  availableBadge: {
    defaultMessage: "Available",
    id: "PvWb6LSHFM",
    description: "Slack integration badge when no workspace is linked yet",
  },
  enabledStatus: {
    defaultMessage: "Enabled",
    id: "gq9Z4S47VX",
    description: "Slack agent status title when connected and enabled",
  },
  disabledStatus: {
    defaultMessage: "Disabled",
    id: "8nYNjmNA8P",
    description: "Slack agent status title when connected but disabled",
  },
  notConnectedStatus: {
    defaultMessage: "Not connected",
    id: "W3mkNKamaw",
    description: "Slack agent status title when no workspace is linked",
  },
  statusDescriptionConnected: {
    defaultMessage: "Installed on {workspace}",
    id: "N564Eak7tL",
    description: "Slack integration description when a workspace is linked",
  },
  slackWorkspaceFallback: {
    defaultMessage: "Slack workspace",
    id: "JcGQchl/ia",
    description: "Fallback workspace name in Slack status when team name is missing",
  },
  statusDescriptionNotConnected: {
    defaultMessage:
      "Connect a Slack workspace to let Hyperlocalise respond to mentions, DMs, and subscribed threads.",
    id: "DeMAC4mdid",
    description: "Slack integration description before OAuth connection",
  },
  reconnectSlack: {
    defaultMessage: "Reconnect Slack",
    id: "SAjiqcjzOx",
    description: "Primary action label when Slack is already connected",
  },
  connectSlack: {
    defaultMessage: "Connect Slack",
    id: "F/3zp/X191",
    description: "Primary action label to start Slack OAuth",
  },
});
