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
"use client";

import { defineMessages } from "react-intl";

export const projectTemplateDialogMessages = defineMessages({
  createTitle: {
    defaultMessage: "New project template",
    id: "m43BivQAe+",
    description: "Title of the dialog that creates a project template",
  },
  editTitle: {
    defaultMessage: "Edit project template",
    id: "LWMVGuquEM",
    description: "Title of the dialog that edits a project template",
  },
  dialogDescription: {
    defaultMessage:
      "New projects created from this template start with these languages, settings, translation memories and glossaries. Changing the template later doesn't change existing projects.",
    id: "KMqfuFnJC7",
    description: "Description of the project template dialog",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "8GW5T/vK58",
    description: "Label for the project template name field",
  },
  namePlaceholder: {
    defaultMessage: "App UI strings",
    id: "JoBM65QNJZ",
    description: "Placeholder for the project template name field",
  },
  descriptionLabel: {
    defaultMessage: "What it's for",
    id: "3x1nleFyLO",
    description: "Label for the project template description field",
  },
  descriptionPlaceholder: {
    defaultMessage: "Product UI requests from the Lark form",
    id: "vtZoNZj4T3",
    description: "Placeholder for the project template description field",
  },
  teamLabel: {
    defaultMessage: "Team",
    id: "fI6dtloNQI",
    description: "Label for the team new projects from a template belong to",
  },
  creatorTeam: {
    defaultMessage: "Creator's team",
    id: "PZgNN5/qld",
    description: "Team option that puts each new project in the creator's team",
  },
  memoriesLabel: {
    defaultMessage: "Translation memories",
    id: "eE0tsyfxal",
    description: "Label for the translation memories a project template attaches",
  },
  memoriesHint: {
    defaultMessage:
      "Ticked memories are attached to each new project in the order you tick them. With none, each project gets its own memory.",
    id: "H/VlF61R2z",
    description: "Hint for choosing translation memories in a project template",
  },
  memoriesEmpty: {
    defaultMessage: "No translation memories in this workspace yet.",
    id: "DL8HzbOr0H",
    description: "Shown when the workspace has no translation memories to attach",
  },
  glossariesLabel: {
    defaultMessage: "Glossaries",
    id: "EN6yp4irjQ",
    description: "Label for the glossaries a project template attaches",
  },
  glossariesHint: {
    defaultMessage: "Only glossaries with {locale} as their source language are listed.",
    id: "NvIRqhEYfQ",
    description: "Hint for choosing glossaries in a project template",
  },
  glossariesEmpty: {
    defaultMessage: "No glossaries use {locale} as their source language.",
    id: "XXAZSD2ySY",
    description: "Shown when no glossary matches the project template source language",
  },
  projectDescriptionLabel: {
    defaultMessage: "Project description",
    id: "PAcb3WMFyK",
    description: "Label for the description copied to each new project",
  },
  translationContextLabel: {
    defaultMessage: "Translation context",
    id: "5/JlWQIS80",
    description: "Label for the translation context copied to each new project",
  },
  translationContextPlaceholder: {
    defaultMessage: "Audience, tone, product terms, and anything else translators should know",
    id: "avLrxSZyM6",
    description: "Placeholder for the project template translation context field",
  },
  sourceTextEditableLabel: {
    defaultMessage: "Edit source text in Hyperlocalise",
    id: "jEELC4GVL9",
    description: "Label for the setting that lets source text be edited in the platform",
  },
  sourceTextEditableHint: {
    defaultMessage: "Source edits are kept when files are imported again.",
    id: "zAG4SwPTRF",
    description: "Hint for the source text editing setting in a project template",
  },
  groupingLabel: {
    defaultMessage: "Group identical strings",
    id: "IFp0oSHgnu",
    description: "Label for the setting that groups identical strings in the editor",
  },
  groupingHint: {
    defaultMessage: "Translate repeated text once in the editor.",
    id: "hvPLdm7HXv",
    description: "Hint for the identical string grouping setting in a project template",
  },
  sourceChangeLabel: {
    defaultMessage: "When source text changes",
    id: "J1IMeYwM5j",
    description: "Label for what happens to approved translations when the source changes",
  },
  sourceChangeStayApproved: {
    defaultMessage: "Keep translations approved",
    id: "dsGyHtKeqK",
    description: "Option that keeps approved translations approved when the source changes",
  },
  sourceChangeNeedsReview: {
    defaultMessage: "Send translations back to review",
    id: "GR5L0fi6FA",
    description: "Option that sends approved translations back to review when the source changes",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Eov7Ul4kjT",
    description: "Button that closes the project template dialog without saving",
  },
  save: {
    defaultMessage: "Save template",
    id: "yFzAaaVXTO",
    description: "Button that saves a project template",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "+mKKo6xHkl",
    description: "Button label while a project template is saving",
  },
});
