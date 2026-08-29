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

export const projectCatBehaviorMessages = defineMessages({
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
    defaultMessage: "Automatically group identical strings",
    id: "b6mn1qkBp4",
    description: "Identical string grouping setting label",
  },
  settingDescription: {
    defaultMessage:
      "Show exact source-text duplicates as a shared group when the Content Editor refreshes.",
    id: "2F2dNLV6FZ",
    description: "Identical string grouping setting description",
  },
  managerOnly: {
    defaultMessage: "Only project managers can change this setting.",
    id: "5h52MoVR2a",
    description: "CAT setting permission help",
  },
  enableTitle: {
    defaultMessage: "Group identical strings?",
    id: "QdeL6ZDB5C",
    description: "Enable grouping confirmation title",
  },
  enableDescription: {
    defaultMessage:
      "This will group an estimated {occurrences, number} occurrences into {groups, number} groups. Existing translations will not be changed.",
    id: "rWZYfLEPfd",
    description: "Enable grouping confirmation description",
  },
  disableTitle: {
    defaultMessage: "Stop grouping identical strings?",
    id: "ZQECIF/mni",
    description: "Disable grouping confirmation title",
  },
  disableDescription: {
    defaultMessage:
      "Grouped rows will expand after Content Editor drafts are saved or discarded. Translations, approvals, comments, and saved separation exceptions will stay unchanged.",
    id: "7oTwMQ/lzH",
    description: "Disable grouping confirmation description",
  },
  cancel: { defaultMessage: "Cancel", id: "E/lJPiTTAo", description: "Cancel CAT behavior change" },
  confirmEnable: {
    defaultMessage: "Enable grouping",
    id: "WUMSOeitWn",
    description: "Confirm enabling CAT grouping",
  },
  confirmDisable: {
    defaultMessage: "Disable grouping",
    id: "jVfYLLHPHu",
    description: "Confirm disabling CAT grouping",
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
