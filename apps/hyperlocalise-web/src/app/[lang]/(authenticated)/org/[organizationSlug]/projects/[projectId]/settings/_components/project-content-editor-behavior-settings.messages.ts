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
    defaultMessage: "Control how source strings are organized in the Content Editor.",
    id: "NCBmUnLeBR",
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
  managerOnly: {
    defaultMessage: "Only project managers can change this setting.",
    id: "5h52MoVR2a",
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
});
