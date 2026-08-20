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

export const projectIssueRoutingRecipesPanelMessages = defineMessages({
  title: {
    defaultMessage: "Routing recipes",
    id: "mVssIXdpPz",
    description: "Title for issue routing recipes settings panel",
  },
  description: {
    defaultMessage:
      "Automatically assign owners and set priority when new issues match predefined rules.",
    id: "n88dI7XyyR",
    description: "Description for issue routing recipes settings panel",
  },
  addRecipe: {
    defaultMessage: "Add recipe",
    id: "Lo9U7917bL",
    description: "Button to add a routing recipe",
  },
  saveButton: {
    defaultMessage: "Save routing recipes",
    id: "KOBG5zeiju",
    description: "Save button for routing recipes panel",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "QWIf7/zyjX",
    description: "Saving state for routing recipes panel",
  },
  saveSuccess: {
    defaultMessage: "Routing recipes saved",
    id: "1/SL5Ua6k8",
    description: "Success toast after saving routing recipes",
  },
  saveError: {
    defaultMessage: "Unable to save routing recipes",
    id: "/EtQL1hrx3",
    description: "Error toast when routing recipes save fails",
  },
  recipeNameLabel: {
    defaultMessage: "Name",
    id: "N+DXcIp+R1",
    description: "Label for routing recipe name field",
  },
  enabledLabel: {
    defaultMessage: "Enabled",
    id: "fPUO9t7+bG",
    description: "Label for routing recipe enabled toggle",
  },
  conditionsLabel: {
    defaultMessage: "When",
    id: "V5lNmSC1rN",
    description: "Label for routing recipe conditions section",
  },
  actionsLabel: {
    defaultMessage: "Then",
    id: "rvUletb+KE",
    description: "Label for routing recipe actions section",
  },
  issueTypesLabel: {
    defaultMessage: "Issue types",
    id: "+cgsnvfZm1",
    description: "Label for routing recipe issue type conditions",
  },
  localesLabel: {
    defaultMessage: "Locales",
    id: "dJe7552Dec",
    description: "Label for routing recipe locale conditions",
  },
  prioritiesLabel: {
    defaultMessage: "Priorities",
    id: "wt1vlvEm21",
    description: "Label for routing recipe priority conditions",
  },
  assigneeLabel: {
    defaultMessage: "Assign to",
    id: "IS/gYCImoD",
    description: "Label for routing recipe assignee action",
  },
  priorityActionLabel: {
    defaultMessage: "Set priority",
    id: "uH6E2xuB/b",
    description: "Label for routing recipe priority action",
  },
  moveUp: {
    defaultMessage: "Move up",
    id: "/CwzOyyea/",
    description: "Move routing recipe higher in order",
  },
  moveDown: {
    defaultMessage: "Move down",
    id: "YDBLFFTyH4",
    description: "Move routing recipe lower in order",
  },
  removeRecipe: {
    defaultMessage: "Remove",
    id: "JwR6P81jWw",
    description: "Remove routing recipe button",
  },
  previewTitle: {
    defaultMessage: "Preview",
    id: "6Vjlrozgng",
    description: "Title for routing recipe preview section",
  },
  previewRunButton: {
    defaultMessage: "Run preview",
    id: "lIYknw6YVi",
    description: "Button to evaluate routing recipes against sample issue fields",
  },
  previewAssigneeLabel: {
    defaultMessage: "Assignee on create",
    id: "R732jllsCC",
    description: "Preview field label for assignee already set at create time",
  },
  conditionsHelper: {
    defaultMessage: "Unchecked options match any value.",
    id: "agEjB/nwPh",
    description: "Helper text explaining optional routing recipe conditions",
  },
  previewHelper: {
    defaultMessage: "Simulate a new issue to see which recipe would run first.",
    id: "qH8cfy7IwT",
    description: "Helper text for routing recipe preview section",
  },
  previewIssueType: {
    defaultMessage: "Issue type",
    id: "RDBOM5GZAl",
    description: "Preview field label for issue type",
  },
  previewLocale: {
    defaultMessage: "Locale",
    id: "p+vdeF5uCs",
    description: "Preview field label for target locale",
  },
  previewPriority: {
    defaultMessage: "Priority",
    id: "dNeFbY0Nf4",
    description: "Preview field label for priority",
  },
  previewAssigneeSet: {
    defaultMessage: "Assignee already set on create",
    id: "tFgJpveBWW",
    description: "Preview note when assignee action is skipped",
  },
  previewPrioritySet: {
    defaultMessage: "Priority already set on create",
    id: "VbROsugmrH",
    description: "Preview note when priority action is skipped",
  },
  previewNoMatch: {
    defaultMessage: "No enabled recipe matches these values.",
    id: "b//JPYXI7J",
    description: "Preview result when no routing recipe matches",
  },
  previewWouldAssign: {
    defaultMessage: "Would assign to {assignee}",
    id: "1EVn3yQdVV",
    description: "Preview result when recipe would assign a member",
  },
  previewWouldSetPriority: {
    defaultMessage: "Would set priority to {priority}",
    id: "kAH3jcfpkL",
    description: "Preview result when recipe would set priority",
  },
  previewAssigneeNotAssignable: {
    defaultMessage: "Matched recipe assignee lacks project access.",
    id: "DXNbsGdbTQ",
    description: "Preview warning when assignee is not assignable",
  },
  failuresTitle: {
    defaultMessage: "Recent routing failures",
    id: "8jUvnHaMj0",
    description: "Title for routing failures list in settings",
  },
  anyCondition: {
    defaultMessage: "Any",
    id: "f+Hcy+Gdps",
    description: "Placeholder when a routing condition dimension is unrestricted",
  },
  addConditionButton: {
    defaultMessage: "Add",
    id: "05z1vALQJb",
    description: "Button to add a routing recipe condition chip",
  },
  removeConditionChipAriaLabel: {
    defaultMessage: "Remove {label}",
    id: "3HTXmrvSmL",
    description: "Accessible label for removing a routing condition chip",
  },
  allConditionsSelected: {
    defaultMessage: "All options selected",
    id: "V/7yl05wAD",
    description: "Hint when every option in a routing condition field is already selected",
  },
  nonePriority: {
    defaultMessage: "No change",
    id: "VJV4L8uYmF",
    description: "Option to skip priority action on a routing recipe",
  },
});
