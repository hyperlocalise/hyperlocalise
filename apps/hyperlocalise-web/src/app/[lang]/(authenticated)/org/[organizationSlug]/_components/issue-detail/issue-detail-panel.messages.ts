"use client";

import { defineMessages } from "react-intl";

export const issueDetailPanelMessages = defineMessages({
  sheetTitle: {
    defaultMessage: "Issue details",
    id: "l2pq2plLde",
    description: "Title for the issue detail drawer",
  },
  loading: {
    defaultMessage: "Loading issue…",
    id: "87YejAyMlf",
    description: "Loading state while fetching a single issue",
  },
  loadError: {
    defaultMessage: "Could not load this issue.",
    id: "NfnpZsFAE9",
    description: "Error state when single issue fetch fails",
  },
  notFound: {
    defaultMessage: "This issue could not be found.",
    id: "TpepILtGKC",
    description: "Error when issue detail returns not found",
  },
  saved: {
    defaultMessage: "Saved",
    id: "EVE7+QSKr9",
    description: "Brief success label after saving an issue field",
  },
  fieldTitle: {
    defaultMessage: "Title",
    id: "4RE0bnosRR",
    description: "Label for issue title field",
  },
  fieldDescription: {
    defaultMessage: "Description",
    id: "Mubi5jvzbc",
    description: "Label for issue description field",
  },
  fieldStatus: {
    defaultMessage: "Status",
    id: "UirP0XHash",
    description: "Label for issue status field",
  },
  fieldType: {
    defaultMessage: "Type",
    id: "Cow2splN/1",
    description: "Label for issue type field",
  },
  fieldPriority: {
    defaultMessage: "Priority",
    id: "MwxM6cb/1r",
    description: "Label for issue priority field",
  },
  fieldAssignee: {
    defaultMessage: "Assignee",
    id: "e1ZCr/FmBQ",
    description: "Label for issue assignee field",
  },
  assigneeUnassigned: {
    defaultMessage: "Unassigned",
    id: "UfX+B2NG5i",
    description: "Option for clearing issue assignee",
  },
  fieldReporter: {
    defaultMessage: "Reporter",
    id: "Cp3xy0MA7p",
    description: "Label for issue reporter field",
  },
  fieldLocale: {
    defaultMessage: "Locale",
    id: "nLGLyaeThi",
    description: "Label for issue target locale field",
  },
  fieldSourcePath: {
    defaultMessage: "Source path",
    id: "lEtyUUSw7r",
    description: "Label for issue source path field",
  },
  fieldCreatedAt: {
    defaultMessage: "Created",
    id: "8roD8NwsMT",
    description: "Label for issue created timestamp",
  },
  fieldUpdatedAt: {
    defaultMessage: "Updated",
    id: "7bzkQaXdN3",
    description: "Label for issue updated timestamp",
  },
  fieldResolvedAt: {
    defaultMessage: "Resolved",
    id: "HmDnokfJEK",
    description: "Label for issue resolved timestamp",
  },
  linkedContext: {
    defaultMessage: "Linked context",
    id: "W3V5ERIIW9",
    description: "Section heading for linked issue context",
  },
  fieldKey: {
    defaultMessage: "Key",
    id: "awnc3dv3Xw",
    description: "Label for translation key on an issue",
  },
  fieldSourceText: {
    defaultMessage: "Source text",
    id: "syMBsg2OBf",
    description: "Label for source text on an issue",
  },
  fieldSegmentId: {
    defaultMessage: "Segment",
    id: "dQccrvPeHu",
    description: "Label for CAT segment id on an issue",
  },
  fieldLink: {
    defaultMessage: "Link kind",
    id: "RBrBoi9ilw",
    description: "Label for issue link kind",
  },
  fieldOwnerNote: {
    defaultMessage: "Owner note",
    id: "Nw/qZUdZvV",
    description: "Label for issue owner note field",
  },
  fieldOwnerNotePlaceholder: {
    defaultMessage: "Add a note for the issue owner…",
    id: "ImR4b9kD2P",
    description: "Placeholder for the owner note textarea",
  },
  openInCat: {
    defaultMessage: "Open in CAT",
    id: "HDO9bAX2qb",
    description: "Button to open the linked CAT segment",
  },
  openInCatUnavailable: {
    defaultMessage: "Add a source path and locale to open this issue in CAT.",
    id: "cd7UpbIU0k",
    description: "Helper when Open in CAT is unavailable",
  },
  openLink: {
    defaultMessage: "Open link",
    id: "0AIuIWXaN7",
    description: "Button to open a custom issue link",
  },
  updateFailed: {
    defaultMessage: "Could not save changes.",
    id: "fhtliL5Eg6",
    description: "Toast when issue detail update fails",
  },
  titleRequired: {
    defaultMessage: "Title cannot be empty.",
    id: "kx356lhAw5",
    description: "Toast when saving issue details with an empty title",
  },
  unsavedChangesTitle: {
    defaultMessage: "Unsaved changes",
    id: "f5viDmb9eZ",
    description: "Title for unsaved changes confirmation when closing issue details",
  },
  unsavedChangesDescription: {
    defaultMessage:
      "You have unsaved edits on this issue. Save them before closing, or discard them.",
    id: "xy1S5rhKQr",
    description: "Description for unsaved changes confirmation when closing issue details",
  },
  unsavedChangesSave: {
    defaultMessage: "Save",
    id: "xEznmg3kZB",
    description: "Save and close button on unsaved changes dialog",
  },
  unsavedChangesDiscard: {
    defaultMessage: "Discard",
    id: "xa11NKAkvz",
    description: "Discard changes and close button on unsaved changes dialog",
  },
  unsavedChangesKeepEditing: {
    defaultMessage: "Keep editing",
    id: "uNxjflTYdv",
    description: "Cancel close and keep editing button on unsaved changes dialog",
  },
});
