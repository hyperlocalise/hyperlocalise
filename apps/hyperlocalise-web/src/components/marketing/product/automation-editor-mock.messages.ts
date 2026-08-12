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
  stepName: {
    defaultMessage: "Name",
    id: "BMNLfAgw5x",
    description: "Automation editor mock step 1 label",
  },
  stepTrigger: {
    defaultMessage: "Trigger",
    id: "AajEsSE+hR",
    description: "Automation editor mock step 2 label",
  },
  stepInstructions: {
    defaultMessage: "Instructions",
    id: "xU2mTsVdgm",
    description: "Automation editor mock step 3 label",
  },
  stepTools: {
    defaultMessage: "Tools",
    id: "aqS5syqWUj",
    description: "Automation editor mock step 4 label",
  },
  stepDone: {
    defaultMessage: "Done",
    id: "++aYQ1TRLC",
    description: "Automation editor mock step 5 label",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "zCyCOk2pNz",
    description: "Automation editor mock active status label",
  },
  triggersLabel: {
    defaultMessage: "Triggers",
    id: "mt7IRvNct1",
    description: "Automation editor mock triggers section label",
  },
  instructionsLabel: {
    defaultMessage: "Agent Instructions",
    id: "eB0ZjLlVEc",
    description: "Automation editor mock instructions section label",
  },
  toolsLabel: {
    defaultMessage: "Tools",
    id: "k16qj61I3x",
    description: "Automation editor mock tools section label",
  },
  connectFirst: {
    defaultMessage: "Connect first",
    id: "OygepqeNOm",
    description: "Automation editor mock connect first label",
  },
  back: {
    defaultMessage: "Back",
    id: "VoF4K7uTKE",
    description: "Automation editor mock back button",
  },
  next: {
    defaultMessage: "Next",
    id: "cP0nBEuivy",
    description: "Automation editor mock next button",
  },

  doneHeadline: {
    defaultMessage: "Your agent is ready",
    id: "0wqyeVvWYJ",
    description: "Automation editor mock done step headline",
  },
  doneDescription: {
    defaultMessage:
      "This automation will validate localisation changes on every push to main and notify your team when blockers are found.",
    id: "cZZfgTS7B4",
    description: "Automation editor mock done step description",
  },
  replay: {
    defaultMessage: "Replay",
    id: "ghEbetjdQZ",
    description: "Automation editor mock replay button — restarts the walkthrough from step 1",
  },
  addTrigger: {
    defaultMessage: "+ Add Trigger",
    id: "se1GI/dGPN",
    description: "Automation editor mock add trigger label",
  },
  repositoryPlaceholder: {
    defaultMessage: "Repository",
    id: "8WUqoWSsf9",
    description: "Automation editor mock repository placeholder",
  },
  namePlaceholder: {
    defaultMessage: "Untitled automation",
    id: "hIVEBd5Bek",
    description: "Automation editor mock name input placeholder",
  },
});

export type AutomationEditorMockMessageKey = keyof typeof automationEditorMockMessages;
