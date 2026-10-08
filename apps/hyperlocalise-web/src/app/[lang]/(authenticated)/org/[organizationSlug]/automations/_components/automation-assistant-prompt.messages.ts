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

export const automationAssistantPromptMessages = defineMessages({
  promptLabel: {
    defaultMessage: "Describe the automation",
    id: "wU/mAJtu+z",
    description: "Accessible label of the box where the user describes the automation they want",
  },
  promptPlaceholder: {
    defaultMessage:
      "Describe what you want to automate. For example: every Monday, summarise what changed in our translations and post it to Slack.",
    id: "94qaE7Dohi",
    description: "Placeholder of the box where the user describes the automation they want",
  },
  submitPrompt: {
    defaultMessage: "Set it up",
    id: "61DJfcncyr",
    description:
      "Button that sends the user's description to the assistant to build the automation",
  },
  aiFeaturesRequired: {
    defaultMessage: "The assistant needs a plan with AI features.",
    id: "BcMa5KTy8c",
    description:
      "Shown in place of the assistant prompt box when the workspace plan does not include AI features",
  },
});
