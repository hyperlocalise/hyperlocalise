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

export const slackLaunchIntakeIllustrationMessages = defineMessages({
  channelName: {
    defaultMessage: "launch-ops",
    id: "nK8wQp2mLx",
    description: "Slack channel name in the launch intake illustration",
  },
  memberCount: {
    defaultMessage: "6",
    id: "rT4vHj9sAe",
    description: "Member count shown in the Slack channel header",
  },
  agentBadge: {
    defaultMessage: "APP",
    id: "bM6cYu1oWd",
    description: "Badge next to the Hyperlocalise agent name in the Slack mock",
  },
  agentName: {
    defaultMessage: "Hyperlocalise",
    id: "fP3nXa7kRq",
    description: "Hyperlocalise Slack agent display name",
  },
  userName: {
    defaultMessage: "Maya Chen",
    id: "gL2sDw5tVz",
    description: "Marketing teammate name in the Slack launch intake mock",
  },
  blurMessageOne: {
    defaultMessage: "Synced Canva board \"Spring campaign / EN\" — 48 text layers ready for intake.",
    id: "hC9eBr4uNm",
    description: "Earlier agent message in the Slack channel (shown muted)",
  },
  channelPrompt: {
    defaultMessage:
      "Hey {mention} can we localize the Canva spring campaign board for FR, DE, and JA by Friday?",
    id: "kW1aTg6cXe",
    description: "Marketing teammate message asking to localize a Canva campaign",
  },
  repliesLabel: {
    defaultMessage: "{count} replies",
    id: "mE7dUi3hBn",
    description: "Thread replies link under the channel prompt message",
  },
  threadTitle: {
    defaultMessage: "Thread",
    id: "pA4vCk9sLm",
    description: "Title of the Slack thread pane",
  },
  closeThreadAria: {
    defaultMessage: "Close thread",
    id: "sR8nYj2wQf",
    description: "Accessible label for the close control on the Slack thread pane",
  },
  agentSummaryIntro: {
    defaultMessage: "Got it, Maya — I pulled the Canva board and scoped launch intake:",
    id: "tU6bHo5xZd",
    description: "Agent intro line before the structured intake summary",
  },
  intakeItemDesign: {
    defaultMessage: "Canva · Spring campaign board (6 frames)",
    id: "vI3cMp7aKw",
    description: "Intake summary line for the Canva design source",
  },
  intakeItemLayers: {
    defaultMessage: "48 text layers extracted with frame context",
    id: "wO9dNq1eRt",
    description: "Intake summary line for extracted Canva text layers",
  },
  intakeItemLocales: {
    defaultMessage: "Locales: fr-FR, de-DE, ja-JP · due Friday",
    id: "xP2fSr4gYu",
    description: "Intake summary line for target locales and deadline",
  },
  intakeItemReview: {
    defaultMessage: "Human review in your TMS before publish-back to Canva",
    id: "yQ5hTu8iZv",
    description: "Intake summary line for human review workflow",
  },
  agentSummaryOutro: {
    defaultMessage: "Want me to open translation tasks and attach the brand brief as context?",
    id: "zR8jVw1kAx",
    description: "Agent follow-up asking to create translation tasks",
  },
  userFollowUp: {
    defaultMessage: "Yes — keep voice notes from the brief on every locale.",
    id: "aS1kXy4lBm",
    description: "Marketing teammate confirming task creation and brand voice",
  },
  agentConfirmation: {
    defaultMessage:
      "Tasks created for all three locales. Brand brief attached as context; I’ll ping reviewers when drafts are ready.",
    id: "bT4mZa7nCo",
    description: "Agent confirmation after creating Canva localization tasks",
  },
  composerPlaceholder: {
    defaultMessage: "Message #launch-ops",
    id: "cU7nAb0pDq",
    description: "Placeholder text in the Slack message composer",
  },
});
