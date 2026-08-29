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

export const issueSheetCreateIssueDialogMessages = defineMessages({
  title: {
    defaultMessage: "New issue",
    id: "UvLPwAuWGw",
    description: "Title of the create Issue Sheet issue dialog",
  },
  description: {
    defaultMessage:
      "Capture a localization issue and optionally link it to the Content Editor or an external tracker.",
    id: "rg7WUSTOmR",
    description: "Description of the create Issue Sheet issue dialog",
  },
  projectLabel: {
    defaultMessage: "Project",
    id: "onK9zkEY64",
    description: "Label for the project select in the create issue dialog",
  },
  projectPlaceholder: {
    defaultMessage: "Select a project",
    id: "Jm9tR2PeYs",
    description: "Placeholder for the project select in the create issue dialog",
  },
  titleLabel: {
    defaultMessage: "Title",
    id: "1wPEKChqz/",
    description: "Label for the issue title input",
  },
  titleRequired: {
    defaultMessage: "Title is required",
    id: "sKaaLQUNWs",
    description: "Validation error when creating an issue without a title",
  },
  titlePlaceholder: {
    defaultMessage: "Issue title",
    id: "afDLXVwU/G",
    description: "Placeholder for the issue title input",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "Xc4174DTX1",
    description: "Label for the issue description editor",
  },
  descriptionPlaceholder: {
    defaultMessage: "Write, or type / for blocks…",
    id: "KmO8v/yN7F",
    description: "Placeholder for the issue description textarea",
  },
  statusLabel: {
    defaultMessage: "Status",
    id: "8cIXg7FjMX",
    description: "Aria label for the status property in the create issue dialog",
  },
  issueTypeLabel: {
    defaultMessage: "Type",
    id: "Ps/K17cn8c",
    description: "Label for the issue type select",
  },
  issueTypePlaceholder: {
    defaultMessage: "Issue type",
    id: "izdWVYn/yN",
    description: "Placeholder for the issue type select",
  },
  priorityLabel: {
    defaultMessage: "Priority",
    id: "9Smo/yfjr3",
    description: "Label for the priority select",
  },
  priorityPlaceholder: {
    defaultMessage: "Priority",
    id: "3y5ogrzNWd",
    description: "Placeholder for the priority select",
  },
  assigneeLabel: {
    defaultMessage: "Assignee",
    id: "sE8e8Vuut1",
    description: "Label for assignee on create issue dialog",
  },
  moreProperties: {
    defaultMessage: "More properties",
    id: "kJB7LZiflj",
    description: "Aria label for the more properties button in the create issue dialog",
  },
  setType: {
    defaultMessage: "Set type",
    id: "JfbQQEL9oW",
    description: "More menu action to set issue type",
  },
  setTemplate: {
    defaultMessage: "Set template",
    id: "lv1AQlJPi4",
    description: "More menu action to apply an issue template",
  },
  sourceLabel: {
    defaultMessage: "Source:",
    id: "geFmDsE0aZ",
    description:
      "Heading above the quoted CAT segment source text appended below a template's description skeleton",
  },
  setLocale: {
    defaultMessage: "Set locale",
    id: "MlaMWBdPiE",
    description: "More menu action to set target locale",
  },
  setSourcePath: {
    defaultMessage: "Set source path",
    id: "EMm+gaNq/8",
    description: "More menu action to set source path",
  },
  addLink: {
    defaultMessage: "Add link…",
    id: "dtA9CObQ6G",
    description: "More menu action to add an external link",
  },
  setColumn: {
    defaultMessage: "Set {label}",
    id: "XdFM8Ff6nf",
    description: "More menu action to set a custom column value",
  },
  clearValue: {
    defaultMessage: "Clear",
    id: "JzWvMRP2Wi",
    description: "Clear the current value in a more-menu submenu",
  },
  localeLabel: {
    defaultMessage: "Locale",
    id: "Ack+p0VluH",
    description: "Label for the target locale input",
  },
  localePlaceholder: {
    defaultMessage: "e.g. de-DE",
    id: "myimkcq73K",
    description: "Placeholder for the target locale input",
  },
  sourcePathLabel: {
    defaultMessage: "Source path",
    id: "Gz/Ip82h05",
    description: "Label for the source path input",
  },
  sourcePathPlaceholder: {
    defaultMessage: "path/to/file.json",
    id: "9cKD+mtj5v",
    description: "Placeholder for the source path input",
  },
  linkLabelLabel: {
    defaultMessage: "Link label",
    id: "V+EGj1aT6i",
    description: "Label for the link label input",
  },
  linkLabelPlaceholder: {
    defaultMessage: "Open in tracker",
    id: "abXWU27lQ5",
    description: "Placeholder for the link label input",
  },
  linkUrlLabel: {
    defaultMessage: "Link URL",
    id: "jBT5g3zPS2",
    description: "Label for the link URL input",
  },
  linkUrlPlaceholder: {
    defaultMessage: "https://…",
    id: "5Ol0Sy99An",
    description: "Placeholder for the link URL input",
  },
  unassigned: {
    defaultMessage: "Unassigned",
    id: "iOn8sWqJvi",
    description: "Clear/unassigned option in a user custom column submenu",
  },
  createMore: {
    defaultMessage: "Create more",
    id: "SEclZdUwgN",
    description: "Checkbox label to keep the create issue dialog open after submit",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "ozFSiYX+w7",
    description: "Cancel button in the create Issue Sheet issue dialog",
  },
  submit: {
    defaultMessage: "Create issue",
    id: "PEOKvIZPuS",
    description: "Submit button in the create Issue Sheet issue dialog",
  },
  selectProject: {
    defaultMessage: "Select a project",
    id: "2/yYwzb8qH",
    description: "Validation error when creating an issue without a selected project",
  },
  issueAdded: {
    defaultMessage: "Issue created",
    id: "Neb7Fy6bU4",
    description: "Toast when an Issue Sheet issue is created successfully",
  },
  createFailed: {
    defaultMessage: "Issue create failed",
    id: "ezkux42m34",
    description: "Fallback toast when creating an Issue Sheet issue fails",
  },
  requestFailed: {
    defaultMessage: "Request failed",
    id: "s7KJsLFXt/",
    description: "Fallback error when the create issue API request fails",
  },
});
