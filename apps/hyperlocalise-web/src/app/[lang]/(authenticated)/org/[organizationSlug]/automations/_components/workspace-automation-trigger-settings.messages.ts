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

export const workspaceAutomationTriggerMessages = defineMessages({
  githubGroup: {
    defaultMessage: "GitHub",
    id: "3FORZKT8kA",
    description: "Group label for the GitHub triggers in the trigger menu",
  },
  manual: {
    defaultMessage: "Manually triggered",
    id: "Q1L+yJ8XSQ",
    description: "Trigger option: runs only start when a teammate queues one",
  },
  scheduled: {
    defaultMessage: "On a schedule",
    id: "Esko1i+4Ce",
    description: "Trigger option: runs start on a recurring schedule",
  },
  githubPush: {
    defaultMessage: "A push is made",
    id: "Y5eLpV2pW7",
    description: "Trigger option: runs start when commits are pushed to a GitHub branch",
  },
  githubPullRequest: {
    defaultMessage: "A pull request is made",
    id: "2oVtczeNOQ",
    description: "Trigger option: runs start when a GitHub pull request is opened",
  },
  githubPushOrPullRequest: {
    defaultMessage: "A push or pull request is made",
    id: "dRdu6AmG9q",
    description: "Trigger option: runs start on a GitHub push or a pull request",
  },
  contentful: {
    defaultMessage: "A Contentful entry is published",
    id: "POwFafn88U",
    description: "Trigger option: runs start when Contentful sends an entry publish webhook",
  },
  sourceUpload: {
    defaultMessage: "A source file is uploaded",
    id: "BN2svhpj+I",
    description: "Trigger option: runs start when a source file is uploaded to the project",
  },
  webChat: {
    defaultMessage: "A web chat message arrives",
    id: "GwpF6lZmgi",
    description: "Trigger option: the public web chat starts runs",
  },
  toBranch: {
    defaultMessage: "to branch",
    id: "WxCNLYrtLZ",
    description: "Prose between a GitHub trigger name and its branch selector",
  },
  ofRepository: {
    defaultMessage: "of",
    id: "iZDkCT6NKD",
    description: "Prose between the branch selector and the repository selector",
  },
  every: {
    defaultMessage: "every",
    id: "jSv2EzfhBb",
    description: "Prose before the schedule cadence selector",
  },
  cadenceHour: {
    defaultMessage: "hour",
    id: "GBrU/Yf91B",
    description: "Schedule cadence option, read as 'every hour'",
  },
  cadenceDay: {
    defaultMessage: "day",
    id: "bhOiFiy9f9",
    description: "Schedule cadence option, read as 'every day'",
  },
  cadenceWeek: {
    defaultMessage: "week",
    id: "Vqod37n0hK",
    description: "Schedule cadence option, read as 'every week'",
  },
  onWeekday: {
    defaultMessage: "on",
    id: "/pluRPE2+f",
    description: "Prose before the weekday selector of a weekly schedule",
  },
  at: {
    defaultMessage: "at",
    id: "qXrjzjRe0i",
    description: "Prose before the hour selector of a schedule",
  },
  cadenceAriaLabel: {
    defaultMessage: "Schedule cadence",
    id: "fTTzRnUPpJ",
    description: "Accessible label for the schedule cadence selector",
  },
  weekdayAriaLabel: {
    defaultMessage: "Schedule weekday",
    id: "CKG9S/rkQM",
    description: "Accessible label for the schedule weekday selector",
  },
  hourAriaLabel: {
    defaultMessage: "Schedule hour",
    id: "GkBUFyeO69",
    description: "Accessible label for the schedule hour selector",
  },
  chatUrl: {
    defaultMessage: "Chat URL",
    id: "g5OYzJZ1DT",
    description: "Prose before the public web chat URL field",
  },
  contentfulOfType: {
    defaultMessage: "of type",
    id: "rQ7m4xP0Uf",
    description: "Prose between the Contentful trigger name and the content types that start a run",
  },
  contentfulAnyType: {
    defaultMessage: "of any content type",
    id: "AQFTimLagD",
    description: "Prose after the Contentful trigger name when every content type starts a run",
  },
  contentfulTypesDiffer: {
    defaultMessage:
      "The Contentful connection's content types have changed since this automation was set up.",
    id: "CnXjT2GLVq",
    description:
      "Notice under the Contentful trigger when the automation's saved content types differ from the connection's current ones",
  },
  contentfulNoStartingType: {
    defaultMessage:
      "The Contentful connection no longer sends any of this automation's content types, so no run will start.",
    id: "92wPWgG68Q",
    description:
      "Warning under the Contentful trigger when none of the automation's saved content types is sent by the connection",
  },
  contentfulUseConnectionTypes: {
    defaultMessage: "Use the connection's content types",
    id: "02hUDkxuJ0",
    description:
      "Button that replaces the automation's saved Contentful content types with the connection's current ones",
  },
});
