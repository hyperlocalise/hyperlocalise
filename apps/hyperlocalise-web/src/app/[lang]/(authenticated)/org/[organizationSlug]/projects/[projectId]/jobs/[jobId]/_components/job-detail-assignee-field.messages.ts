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

export const jobDetailAssigneeFieldMessages = defineMessages({
  loadMembersFailed: {
    defaultMessage: "Couldn't load assignable members",
    id: "5PG+VBWgIw",
    description: "Error when job assignee member list fails to load",
  },
  saveFailed: {
    defaultMessage: "Couldn't update assignees",
    id: "R6n/KCAp4a",
    description: "Toast when job assignee save fails",
  },
  saveSuccess: {
    defaultMessage: "Assignees updated",
    id: "uHbVM9Pw9Y",
    description: "Toast when job assignees are saved",
  },
  unassigned: {
    defaultMessage: "Unassigned",
    id: "FlKUTB/6A0",
    description: "Label when a native job has no owner",
  },
  agent: {
    defaultMessage: "Agent",
    id: "Qgi/HinJwQ",
    description: "Assignee label for a native job assigned to the translation agent",
  },
  triggerAria: {
    defaultMessage: "Assignees",
    id: "xVxao1E4rb",
    description: "Accessible label for the Crowdin multi-assignee picker trigger",
  },
  searchPlaceholder: {
    defaultMessage: "Search members…",
    id: "fM2wynVWWB",
    description: "Placeholder in the Crowdin assignee picker search field",
  },
  empty: {
    defaultMessage: "No members found",
    id: "zPUQ6rTETA",
    description: "Empty state in the Crowdin assignee picker",
  },
  loading: {
    defaultMessage: "Loading…",
    id: "bFbk34uFYE",
    description: "Loading state in the Crowdin assignee picker",
  },
  clearAll: {
    defaultMessage: "Clear all",
    id: "dAeEJyCLaY",
    description: "Action to clear all Crowdin assignees",
  },
  selectedCount: {
    defaultMessage: "{count, plural, =0 {No assignees} one {# assignee} other {# assignees}}",
    id: "/140Sd9x8r",
    description: "Crowdin assignee picker trigger label with selection count",
  },
});
