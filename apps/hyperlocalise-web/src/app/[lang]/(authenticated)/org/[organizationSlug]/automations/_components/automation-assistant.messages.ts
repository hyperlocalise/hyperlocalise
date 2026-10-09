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

export const automationAssistantMessages = defineMessages({
  title: {
    defaultMessage: "Automation assistant",
    id: "2nHgxPOvkU",
    description: "Title of the assistant panel inside the automation editor",
  },
  openButton: {
    defaultMessage: "Configure with assistant",
    id: "H/GgYvxgmB",
    description:
      "Button in the instructions section header that opens and closes the assistant panel",
  },
  startOver: {
    defaultMessage: "Start over",
    id: "1xb/VsB9VL",
    description: "Button in the assistant panel that ends the session and starts a new one",
  },
  close: {
    defaultMessage: "Close the assistant",
    id: "oGqbKb18Lb",
    description: "Label of the button that closes the assistant panel",
  },
  empty: {
    defaultMessage: "Describe what this automation should do, or ask for a change.",
    id: "vqH0waecvA",
    description: "Empty state of the assistant panel before any message",
  },
  composerPlaceholder: {
    defaultMessage: "Ask for a change, or say what this automation should do.",
    id: "fnD091ugod",
    description: "Placeholder of the box in the assistant panel where a follow-up request is typed",
  },
  composerLabel: {
    defaultMessage: "Message the automation assistant",
    id: "K4EZaisMM5",
    description: "Accessible name of the box in the assistant panel where a request is typed",
  },
  composerSend: {
    defaultMessage: "Send",
    id: "dE9jOO9W+A",
    description: "Button that sends the request typed in the assistant panel",
  },
  working: {
    defaultMessage: "Working\u2026",
    id: "fU1mV7SlJj",
    description: "Shown under the assistant's reply while it is still being written",
  },
  turnInProgress: {
    defaultMessage: "The assistant is still working on an earlier request. Wait for it to finish.",
    id: "xT0Si3J+mJ",
    description: "Error in the assistant panel when a turn is already running for this session",
  },
  errorGeneric: {
    defaultMessage: "The assistant could not reply. Try again.",
    id: "b53e4dZaWV",
    description: "Error in the assistant panel when a turn fails",
  },
  toolUpdating: {
    defaultMessage: "Updating the setup\u2026",
    id: "iES04md+8d",
    description: "Line in the assistant's reply while its tool is changing the page",
  },
  toolUpdated: {
    defaultMessage: "Updated the setup",
    id: "vW7W3YnMj8",
    description: "Line in the assistant's reply where its tool changed the page",
  },
  toolFailed: {
    defaultMessage: "The setup could not be updated",
    id: "yLrP3dBABI",
    description: "Line in the assistant's reply for a change to the setup that failed",
  },
  toolNoChanges: {
    defaultMessage: "No changes made to the setup",
    id: "tbEhbMfWzX",
    description: "Line in the assistant's reply for a step that left the setup as it was",
  },
  toolUpdatedCount: {
    defaultMessage: "Updated the setup · {count, plural, one {# change} other {# changes}}",
    id: "FnmoCyuAVI",
    description:
      "Line in the assistant's reply that opens to list what a step changed in the setup",
  },
  toolLineName: {
    defaultMessage: "Name set to “{name}”",
    id: "9/fFWZ/N5x",
    description: "Listed change of the assistant: the automation was named",
  },
  toolLineInstructionsRewritten: {
    defaultMessage: "Instructions rewritten",
    id: "W2x+fZoaB/",
    description: "Listed change of the assistant: the instructions were written or rewritten",
  },
  toolLineInstructionsCleared: {
    defaultMessage: "Instructions cleared",
    id: "rrcSt6OXke",
    description: "Listed change of the assistant: the instructions were emptied",
  },
  toolLineTrigger: {
    defaultMessage: "Trigger: {trigger}",
    id: "B89dpJolat",
    description:
      "Listed change of the assistant: when the automation runs, such as 'On a schedule'",
  },
  toolLineTriggerBranches: {
    defaultMessage: "{trigger} · {branches}",
    id: "LactCqGkxG",
    description:
      "A GitHub trigger followed by the branches it watches, inside a listed change of the assistant",
  },
  toolLineSkillAdded: {
    defaultMessage: "Added skill: {skill}",
    id: "t1ZP8XrgYe",
    description: "Listed change of the assistant: a skill was attached",
  },
  toolLineSkillRemoved: {
    defaultMessage: "Removed skill: {skill}",
    id: "RSk6GpbkWr",
    description: "Listed change of the assistant: a skill was taken off",
  },
  toolLineSkillNeedsConnection: {
    defaultMessage: "Not added: {skill}. Connect {integrations} first.",
    id: "ZGAmtoXmfT",
    description: "Listed step the assistant left out: a skill whose integration is not connected",
  },
  toolLineSkillWrongTrigger: {
    defaultMessage: "Not added: {skill}. It cannot run on this trigger.",
    id: "wRjR3Q5lZO",
    description: "Listed step the assistant left out: a skill that does not work with the trigger",
  },
  changesOnPageSave: {
    defaultMessage:
      "The assistant’s changes are on the page. Undo takes them back. Nothing is saved until you click Save.",
    id: "H7rlNVsswT",
    description:
      "Line at the end of the assistant panel while a saved automation holds changes of the assistant that are not saved",
  },
  changesOnPageCreate: {
    defaultMessage:
      "The assistant’s changes are on the page. Undo takes them back. Nothing is saved until you click Create automation.",
    id: "5tjJj0rNcN",
    description:
      "Line at the end of the assistant panel while a new automation holds changes of the assistant that are not saved",
  },
  headerCreated: {
    defaultMessage: "The assistant set up this automation",
    id: "4XHdLftqfc",
    description:
      "Summary line above the form after the assistant's first change on a new automation",
  },
  headerUpdatedSetup: {
    defaultMessage: "The assistant updated this setup",
    id: "Pdmj0KqU72",
    description: "Summary line above the form after later changes on a new automation",
  },
  headerUpdatedAutomation: {
    defaultMessage: "The assistant updated this automation",
    id: "b/pQ8GedZy",
    description: "Summary line above the form after changes on a saved automation",
  },
  notSavedYet: {
    defaultMessage: "Not saved yet",
    id: "HlQ5X0kamV",
    description: "Badge in the summary line reminding that the assistant's changes are not saved",
  },
  changeCount: {
    defaultMessage: "{count, plural, one {# change} other {# changes}}",
    id: "zmXk1ZRKQV",
    description: "How many changes the assistant made, in the summary line",
  },
  workingSetup: {
    defaultMessage: "The assistant is working on this setup",
    id: "2zAJlPlwdV",
    description: "Summary line while a turn runs on a new automation",
  },
  workingSettings: {
    defaultMessage: "The assistant is changing these settings",
    id: "3uclNe0U4K",
    description: "Summary line while a turn runs on a saved automation",
  },
  stillNeeded: {
    defaultMessage: "Still needed from you",
    id: "Qx9M9Lf9nk",
    description: "Heading of the list of settings the person still has to choose",
  },
  nothingNeededCreate: {
    defaultMessage: "Nothing else is needed. Click Create automation to save it.",
    id: "+cernCtrbo",
    description: "Summary line when the setup is complete on a new automation",
  },
  nothingNeededSave: {
    defaultMessage: "Nothing else is needed. Click Save to keep the changes.",
    id: "8ynQk3TRUP",
    description: "Summary line when the setup is complete on a saved automation",
  },
  connectIntegration: {
    defaultMessage: "Connect {integration} in <link>Integrations</link>",
    id: "hcruMp/+is",
    description: "A still-needed step: an integration a skill needs is not connected",
  },
  repositoryForGithubTrigger: {
    defaultMessage: "Choose the repository the GitHub trigger watches.",
    id: "sAqhqYjNht",
    description: "A still-needed step: the GitHub trigger has no repository",
  },
  nothingToDeliver: {
    defaultMessage:
      "Nothing produces a result yet. Add a skill that checks, summarises or researches something, or write instructions.",
    id: "sgGvzPrbqO",
    description: "A still-needed step: only delivery skills are attached",
  },
  undoTitle: {
    defaultMessage: "Undo the assistant's changes?",
    id: "jgb7zlDoDb",
    description: "Title of the dialog shown before undoing a turn of the assistant",
  },
  undoDescription: {
    defaultMessage:
      "This takes back everything the assistant changed in that turn, including anything you edited since. Redo brings it back.",
    id: "7YJ3F1AQei",
    description: "Body of the dialog shown before undoing a turn of the assistant",
  },
  undoConfirm: {
    defaultMessage: "Undo",
    id: "qS4rFZJx4J",
    description: "Confirm button of the dialog shown before undoing a turn of the assistant",
  },
  undoCancel: {
    defaultMessage: "Keep",
    id: "KQXF59dqej",
    description: "Cancel button of the dialog shown before undoing a turn of the assistant",
  },
});
