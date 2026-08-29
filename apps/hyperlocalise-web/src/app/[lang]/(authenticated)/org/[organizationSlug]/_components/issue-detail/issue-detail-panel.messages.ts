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
  copiedIssueId: {
    defaultMessage: "Issue ID copied",
    id: "seugisaDUz",
    description: "Toast after copying the human-readable issue ID",
  },
  saved: {
    defaultMessage: "Saved",
    id: "iGoxhCxQNO",
    description: "Toast after saving an issue field",
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
  fieldTemplate: {
    defaultMessage: "Template",
    id: "nBWhU6jbvc",
    description: "Label for the read-only issue template provenance field",
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
    defaultMessage: "Linked string",
    id: "CPX3MSYhG+",
    description: "Section heading for the translation string linked to an issue",
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
  unlinkString: {
    defaultMessage: "Unlink string",
    id: "2J9DBNioHN",
    description: "Button to unlink the translation string from an issue",
  },
  stringUnlinked: {
    defaultMessage: "String unlinked",
    id: "lKE9esALm9",
    description: "Toast when a translation string is unlinked from an issue",
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
    defaultMessage: "Open in Content Editor",
    id: "r2yxIB3t+w",
    description: "Button to open the linked Content Editor segment",
  },
  openInCatUnavailable: {
    defaultMessage: "Add a source path and locale to open this issue in the Content Editor.",
    id: "fyihAjDSvB",
    description: "Helper when Open in Content Editor is unavailable",
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
  loadColumnsError: {
    defaultMessage: "Custom fields could not be loaded.",
    id: "ppqLcxUWCQ",
    description: "Error when issue sheet columns fail to load on issue detail",
  },
  retryColumns: {
    defaultMessage: "Retry",
    id: "FtQgWtXBLP",
    description: "Retry button when issue sheet columns fail to load",
  },
  collapseSidebar: {
    defaultMessage: "Collapse properties",
    id: "eaNtS/5vOt",
    description: "Aria label to collapse the issue detail properties sidebar",
  },
  expandSidebar: {
    defaultMessage: "Expand properties",
    id: "a59gdX+rmW",
    description: "Aria label to expand the issue detail properties sidebar",
  },
});
