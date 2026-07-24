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
    defaultMessage: "Add issue",
    id: "shmTD0A07P",
    description: "Title of the create Issue Sheet issue dialog",
  },
  description: {
    defaultMessage:
      "Capture a localization issue and optionally link it to CAT or an external tracker.",
    id: "a9TiPhW1/A",
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
  detailsSection: {
    defaultMessage: "Details",
    id: "HAhLpB+d2h",
    description: "Section heading for title and description in the create issue dialog",
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
    defaultMessage: "Short issue title",
    id: "sBAMcTOMdn",
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
  propertiesSection: {
    defaultMessage: "Properties",
    id: "NbLadz5lws",
    description: "Section heading for type and priority in the create issue dialog",
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
  contextSection: {
    defaultMessage: "Context",
    id: "ZV3TeuXtMA",
    description: "Section heading for locale and source path in the create issue dialog",
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
  linkSection: {
    defaultMessage: "External link",
    id: "nRjDDcLPcB",
    description: "Section heading for optional link fields in the create issue dialog",
  },
  linkLabelLabel: {
    defaultMessage: "Label",
    id: "M4B6W56NTK",
    description: "Label for the link label input",
  },
  linkLabelPlaceholder: {
    defaultMessage: "Open in tracker",
    id: "abXWU27lQ5",
    description: "Placeholder for the link label input",
  },
  linkUrlLabel: {
    defaultMessage: "URL",
    id: "6q29k14I2n",
    description: "Label for the link URL input",
  },
  linkUrlPlaceholder: {
    defaultMessage: "https://…",
    id: "5Ol0Sy99An",
    description: "Placeholder for the link URL input",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "ozFSiYX+w7",
    description: "Cancel button in the create Issue Sheet issue dialog",
  },
  submit: {
    defaultMessage: "Add issue",
    id: "swlRLlRcrP",
    description: "Submit button in the create Issue Sheet issue dialog",
  },
  selectProject: {
    defaultMessage: "Select a project",
    id: "2/yYwzb8qH",
    description: "Validation error when creating an issue without a selected project",
  },
  issueAdded: {
    defaultMessage: "Issue added",
    id: "KIxSVeRx4D",
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
