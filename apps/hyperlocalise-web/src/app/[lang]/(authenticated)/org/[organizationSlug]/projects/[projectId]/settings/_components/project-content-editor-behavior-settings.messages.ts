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

export const projectContentEditorBehaviorMessages = defineMessages({
  title: {
    defaultMessage: "Translation & Content Editor behavior",
    id: "/nKOFEgkYN",
    description: "Content Editor settings section title",
  },
  description: {
    defaultMessage:
      "Control how source strings are organized in the Content Editor, and what source text changes do to approved translations.",
    id: "A7wtt7iAbG",
    description: "Content Editor settings section description",
  },
  settingLabel: {
    defaultMessage: "Automatically merge identical strings",
    id: "OSxEF0/gz3",
    description: "Identical string merging setting label",
  },
  settingDescription: {
    defaultMessage:
      "Merge exact source-text duplicates into one string when the Content Editor refreshes. Translate it once to update every copy.",
    id: "mRVnNMtRYk",
    description: "Identical string merging setting description",
  },
  sourceChangeLabel: {
    defaultMessage: "When source text changes",
    id: "VsdA5eGvzy",
    description:
      "Label of the setting for approved translations when a string's source text changes",
  },
  sourceChangeDescription: {
    defaultMessage: "What happens to approved translations when a string's source text changes.",
    id: "26D7HBTpAx",
    description: "Description of the setting for approved translations when source text changes",
  },
  sourceChangeStayApproved: {
    defaultMessage: "Stays approved",
    id: "Rozd9vYg28",
    description: "Option: approved translations stay approved when source text changes",
  },
  sourceChangeNeedsReview: {
    defaultMessage: "Needs review",
    id: "Rss3gdu7jV",
    description: "Option: approved translations go back to review when source text changes",
  },
  managerOnly: {
    defaultMessage: "Only admins and localization managers can change these settings.",
    id: "uv1LlzZgUw",
    description: "CAT setting permission help",
  },
  enableTitle: {
    defaultMessage: "Merge identical strings?",
    id: "dbIHLj/rDN",
    description: "Enable merging confirmation title",
  },
  enableDescription: {
    defaultMessage:
      "This will merge an estimated {occurrences, number} occurrences into {groups, number} strings. Existing translations will not be changed.",
    id: "2HoetXShu0",
    description: "Enable merging confirmation description",
  },
  disableTitle: {
    defaultMessage: "Stop merging identical strings?",
    id: "pTIEJcqBFe",
    description: "Disable merging confirmation title",
  },
  disableDescription: {
    defaultMessage:
      "Merged strings will split back out after Content Editor drafts are saved or discarded. Translations, approvals, comments, and saved separation exceptions will stay unchanged.",
    id: "6uHZwOPqkd",
    description: "Disable merging confirmation description",
  },
  cancel: { defaultMessage: "Cancel", id: "E/lJPiTTAo", description: "Cancel CAT behavior change" },
  confirmEnable: {
    defaultMessage: "Enable merging",
    id: "CPgNVBCSrU",
    description: "Confirm enabling identical string merging",
  },
  confirmDisable: {
    defaultMessage: "Disable merging",
    id: "HtM5Jg2cRQ",
    description: "Confirm disabling identical string merging",
  },
  saved: {
    defaultMessage: "Content Editor behavior updated",
    id: "jX3Wpfqfza",
    description: "Content Editor behavior save success",
  },
  loadError: {
    defaultMessage: "Unable to load Content Editor behavior",
    id: "DOYogzInHA",
    description: "Content Editor behavior load failure",
  },
  updateError: {
    defaultMessage: "Unable to update Content Editor behavior",
    id: "NzYmU9Xvq7",
    description: "Content Editor behavior update failure",
  },
  sourceTextEditableLabel: {
    defaultMessage: "Edit source text in Hyperlocalise",
    id: "cXMmKKeMKc",
    description: "Source text editing setting label",
  },
  sourceTextEditableDescription: {
    defaultMessage:
      "Lets people edit the source text of JSON, JSONC and ARB files in the Content Editor and through the API. Imports then keep edits made here, translation jobs translate them, and a GitLab sync sends them back in its merge request and lists strings changed on both sides. Off, the next import of a file replaces edits made here with the file's text.",
    id: "6qE2HcfwsA",
    description: "Source text editing setting description",
  },
  sourceTextEditableDisableTitle: {
    defaultMessage: "Stop editing source text here?",
    id: "LHGEza5UBX",
    description: "Disable source text editing confirmation title",
  },
  sourceTextEditableDisableDescription: {
    defaultMessage:
      "Source text edits made here that haven't reached the file yet will be replaced by the file's text on its next import or sync. The Content Editor and the API will no longer change the source text of strings in files.",
    id: "yuUhv1kJRS",
    description: "Disable source text editing confirmation description",
  },
  confirmDisableSourceTextEditing: {
    defaultMessage: "Stop editing here",
    id: "8hvKYJwbIf",
    description: "Confirm disabling source text editing",
  },
});
