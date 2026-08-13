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

export const automationEditorMockMessages = defineMessages({
  sectionEyebrow: {
    defaultMessage: "Agent Automations",
    id: "7sxlGNyze6",
    description: "Automation editor mock section eyebrow",
  },
  sectionHeadline: {
    defaultMessage: "How to create an agent",
    id: "hpoVyBL180",
    description: "Automation editor mock section headline",
  },
  sectionDescription: {
    defaultMessage:
      "Set up an automation in minutes. Choose a trigger, write instructions, and connect your tools.",
    id: "5+B0FprGyT",
    description: "Automation editor mock section description",
  },
  stepNameTitle: {
    defaultMessage: "Name your automation",
    id: "9na05hKYYk",
    description: "Step 1 title",
  },
  stepNameDescription: {
    defaultMessage:
      "Give your automation a clear name so your team knows what it does at a glance.",
    id: "KAOz7du98U",
    description: "Step 1 description",
  },
  stepTriggerTitle: {
    defaultMessage: "Choose a trigger",
    id: "nPBxFBlFGN",
    description: "Step 2 title",
  },
  stepTriggerDescription: {
    defaultMessage:
      "This automation runs every time code is pushed to main — no manual intervention needed.",
    id: "8r7uZX8bHZ",
    description: "Step 2 description",
  },
  stepInstructionsTitle: {
    defaultMessage: "Write agent instructions",
    id: "NetVndRpV9",
    description: "Step 3 title",
  },
  stepInstructionsDescription: {
    defaultMessage:
      "Instructions tell the agent exactly what to check, flag, and ignore on every run.",
    id: "rHh2CqoXbz",
    description: "Step 3 description",
  },
  stepToolsTitle: {
    defaultMessage: "Connect your tools",
    id: "nnCxP1Ix40",
    description: "Step 4 title",
  },
  stepToolsDescription: {
    defaultMessage:
      "Connect GitHub and Slack to let the agent validate changes and notify your team automatically.",
    id: "r9CtFkZBBj",
    description: "Step 4 description",
  },
  stepDoneTitle: {
    defaultMessage: "Your agent is ready",
    id: "NSbs2IoiBz",
    description: "Step 5 title",
  },
  stepDoneDescription: {
    defaultMessage:
      "This automation will validate localisation changes on every push to main and notify your team when blockers are found.",
    id: "GS9z23Wjvp",
    description: "Step 5 description",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "raG3uRf8nJ",
    description: "Active status badge",
  },
  triggersLabel: {
    defaultMessage: "Triggers",
    id: "CjlAET4B6p",
    description: "Triggers section label",
  },
  instructionsLabel: {
    defaultMessage: "Agent Instructions",
    id: "4NdfJ2hUQl",
    description: "Instructions section label",
  },
  toolsLabel: {
    defaultMessage: "Tools",
    id: "S4xxkWiA+1",
    description: "Tools section label",
  },
  connectFirst: {
    defaultMessage: "Connect first",
    id: "iVh7bJsV12",
    description: "Connect first badge",
  },
  addTrigger: {
    defaultMessage: "+ Add Trigger",
    id: "HaCbXbYDK2",
    description: "Add trigger label",
  },
  repositoryPlaceholder: {
    defaultMessage: "Repository",
    id: "n0l2Kl1EOo",
    description: "Repository placeholder",
  },
  automationName: {
    defaultMessage: "Validate localisation on push",
    id: "tTppq6VteH",
    description: "Mock automation name",
  },
  triggerName: {
    defaultMessage: "GitHub push",
    id: "KCbGbSyAbS",
    description: "Mock trigger name",
  },
  branchName: {
    defaultMessage: "main",
    id: "Y+l0NYAqjY",
    description: "Mock branch name",
  },
  githubToolName: {
    defaultMessage: "GitHub sync workflows",
    id: "MOu/tPioP9",
    description: "GitHub tool name",
  },
  githubToolDescription: {
    defaultMessage: "Push source, pull translations, and validation checks.",
    id: "7yn7HMfua7",
    description: "GitHub tool description",
  },
  slackToolName: {
    defaultMessage: "Send to Slack",
    id: "XPrwNbnlai",
    description: "Slack tool name",
  },
  slackToolDescription: {
    defaultMessage: "Connect Slack in Integrations to use this tool.",
    id: "/sTE4eGsTY",
    description: "Slack tool description",
  },
  togglePushSource: {
    defaultMessage: "Push source",
    id: "bZmWrWqZb+",
    description: "Push source toggle label",
  },
  togglePullTranslations: {
    defaultMessage: "Pull translations",
    id: "sVDAoebIsd",
    description: "Pull translations toggle label",
  },
  toggleValidation: {
    defaultMessage: "Validation",
    id: "IiBSQ9rykP",
    description: "Validation toggle label",
  },
  replay: {
    defaultMessage: "Replay",
    id: "PLyElDNRFf",
    description: "Replay button label",
  },
  instructions: {
    defaultMessage:
      "You are a localisation quality automation. Goal: validate source string and translation changes before they reach production. Check changed source strings for missing context, flag missing translations, broken ICU syntax, mismatched placeholders, and unsafe HTML. Treat locale coverage regressions as blocking findings.",
    id: "MdMiqiLHvA",
    description: "Mock agent instructions text",
  },
});

export type AutomationEditorMockMessageKey = keyof typeof automationEditorMockMessages;
