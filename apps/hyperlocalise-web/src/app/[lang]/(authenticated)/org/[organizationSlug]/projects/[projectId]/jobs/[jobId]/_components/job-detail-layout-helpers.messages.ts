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

export const jobDetailLayoutHelpersMessages = defineMessages({
  providerTaskMetric: {
    defaultMessage: "{providerName} task",
    id: "yU1JjWL9rR",
    description: "Metric label identifying a TMS provider-backed job task",
  },
  nativeTaskMetric: {
    defaultMessage: "{kind} task",
    id: "ysf+RB1d04",
    description: "Metric label identifying a native Hyperlocalise job kind",
  },
  loadingProgress: {
    defaultMessage: "Loading progress…",
    id: "M+N6SmzTI9",
    description: "Metric and property value while locale readiness is loading",
  },
  sourceFilesLinked: {
    defaultMessage: "Source files linked",
    id: "czsCIKk1f7",
    description: "Fallback metric when a job has linked source files but no words-to-do count",
  },
  updatedAt: {
    defaultMessage: "Updated {date}",
    id: "l5rW+I/q5y",
    description: "Metric showing when the job was last updated",
  },
  percentTranslated: {
    defaultMessage: "{progress}% translated",
    id: "FtS1qUeQJM",
    description:
      "Progress property fallback when readiness has a percentage but no formatted label",
  },
  providerStatus: {
    defaultMessage: "Provider status: {status}",
    id: "BMoL51WOJW",
    description: "Progress property when only the external provider status string is available",
  },
  labelStatus: {
    defaultMessage: "Status",
    id: "WPDWJsbAQo",
    description: "Job property row label for status",
  },
  labelProgress: {
    defaultMessage: "Progress",
    id: "AdBFuupWOp",
    description: "Job property row label for translation progress",
  },
  labelProvider: {
    defaultMessage: "Provider",
    id: "xFn0NDIq1p",
    description: "Job property row label for TMS provider name",
  },
  labelTaskType: {
    defaultMessage: "Task type",
    id: "KkmE6ygIj4",
    description: "Job property row label for task type",
  },
  labelTargetLocales: {
    defaultMessage: "Target locales",
    id: "sNPTwegSVn",
    description: "Job property row label for target locales",
  },
  labelAssignees: {
    defaultMessage: "Assignees",
    id: "l4izKn2eyP",
    description: "Job property row label for assigned users",
  },
  labelDueDate: {
    defaultMessage: "Due date",
    id: "2AqSyPCt6M",
    description: "Job property row label for due date",
  },
  labelWordsToDo: {
    defaultMessage: "Words to do",
    id: "NEC/JxS1Sr",
    description: "Job property row label for remaining words",
  },
  labelProject: {
    defaultMessage: "Project",
    id: "6p1y0a4MjE",
    description: "Secondary job property row label for project",
  },
  labelLanguage: {
    defaultMessage: "Language",
    id: "9J9XsqiDxS",
    description: "Secondary job property row label for language",
  },
  labelExternalJobId: {
    defaultMessage: "External job ID",
    id: "YvzCKqEm+j",
    description: "Secondary job property row label for external job ID",
  },
  labelExternalTaskId: {
    defaultMessage: "External task ID",
    id: "fUojJ4Vzcu",
    description: "Secondary job property row label for external task ID",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "GpsLS8ojw/",
    description: "Placeholder when a job layout property value is empty",
  },
});
