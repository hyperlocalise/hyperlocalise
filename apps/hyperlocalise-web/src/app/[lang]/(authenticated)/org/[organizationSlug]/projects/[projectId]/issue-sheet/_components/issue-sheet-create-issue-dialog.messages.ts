"use client";

import { defineMessages } from "react-intl";

export const issueSheetCreateIssueDialogMessages = defineMessages({
  title: {
    defaultMessage: "Add issue",
    id: "shmTD0A07P",
    description: "Title of the create Issue Sheet issue dialog",
  },
  description: {
    defaultMessage:
      "Create a generic Issue Sheet row. Link it to CAT or another issue tracker when useful.",
    id: "f2cTOkA6mx",
    description: "Description of the create Issue Sheet issue dialog",
  },
  projectPlaceholder: {
    defaultMessage: "Project",
    id: "4ji5Fi5uSS",
    description: "Placeholder for the project select in the create issue dialog",
  },
  titlePlaceholder: {
    defaultMessage: "Short issue title",
    id: "sBAMcTOMdn",
    description: "Placeholder for the issue title input",
  },
  descriptionPlaceholder: {
    defaultMessage: "What needs context, review, or a fix?",
    id: "JIHTr+V6i/",
    description: "Placeholder for the issue description textarea",
  },
  issueTypePlaceholder: {
    defaultMessage: "Issue type",
    id: "izdWVYn/yN",
    description: "Placeholder for the issue type select",
  },
  priorityPlaceholder: {
    defaultMessage: "Priority",
    id: "3y5ogrzNWd",
    description: "Placeholder for the priority select",
  },
  localePlaceholder: {
    defaultMessage: "Locale, e.g. de-DE",
    id: "J3in5zOVha",
    description: "Placeholder for the target locale input",
  },
  sourcePathPlaceholder: {
    defaultMessage: "Source path",
    id: "qVrZsJxjVe",
    description: "Placeholder for the source path input",
  },
  linkLabelPlaceholder: {
    defaultMessage: "Link label",
    id: "R1EQ0TPM4g",
    description: "Placeholder for the link label input",
  },
  linkUrlPlaceholder: {
    defaultMessage: "https://…",
    id: "5Ol0Sy99An",
    description: "Placeholder for the link URL input",
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
