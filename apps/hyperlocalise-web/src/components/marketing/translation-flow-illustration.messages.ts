"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const translationFlowIllustrationMessages = defineMessages({
  taskTitle: {
    defaultMessage: "Translate Task",
    id: "CFMr/AO+mA",
    description: "Title of the translation flow illustration mock task card",
  },
  taskSubtitle: {
    defaultMessage: "Localise Pricing Messages",
    id: "nULuPBbLbZ",
    description: "Subtitle under the translate task title in the translation flow illustration",
  },
  agenticWorkflowBadge: {
    defaultMessage: "Agentic workflow",
    id: "HzU2+Sm7bp",
    description: "Badge label on the translation flow illustration",
  },
  consoleStarted: {
    defaultMessage: "Started cloud agent",
    id: "rTskJLTUfG",
    description: "Console line in the translation flow illustration when an agent starts",
  },
  consoleTranslating: {
    defaultMessage: "Translating en/pricing.json for 38 locales",
    id: "GautEjzI3s",
    description: "Console line showing translation progress in the translation flow illustration",
  },
  consoleGathering: {
    defaultMessage: "Gathering glossary, translation memory, and release context",
    id: "OYqtJuYY8f",
    description: "Console line for gathering context in the translation flow illustration",
  },
  consoleReviewing: {
    defaultMessage: "Reviewing translated strings with legal and market nuance",
    id: "zTcUh0/Ogq",
    description: "Console line for review step in the translation flow illustration",
  },
  consoleSyncing: {
    defaultMessage: "Syncing to your TMS",
    id: "zkYM+bbGh5",
    description: "Console line for TMS sync in the translation flow illustration",
  },
  workingTitle: {
    defaultMessage: "Working ...",
    id: "D6n7dSmFc7",
    description: "Dot-flow animation title while the agent is working",
  },
  thinkingTitle: {
    defaultMessage: "Thinking",
    id: "80txd8omMU",
    description: "Dot-flow animation title while the agent is thinking",
  },
  assignPlaceholder: {
    defaultMessage: "Assign to...",
    id: "N69cU9WO/g",
    description: "Placeholder in the assign-to selector of the translation flow illustration",
  },
});
