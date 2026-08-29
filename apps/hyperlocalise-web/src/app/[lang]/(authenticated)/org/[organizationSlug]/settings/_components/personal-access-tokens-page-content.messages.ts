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

export const personalAccessTokensPageContentMessages = defineMessages({
  neverUsed: {
    defaultMessage: "Never",
    id: "pAtNvUsed01",
    description: "Shown when a personal access token has never been used",
  },
  loadFailed: {
    defaultMessage: "Failed to load personal access tokens",
    id: "pAtLdFail01",
    description: "Error when the personal access token list request fails",
  },
  createFailed: {
    defaultMessage: "Failed to create personal access token",
    id: "pAtCrFail01",
    description: "Error when creating a personal access token fails",
  },
  revokeFailed: {
    defaultMessage: "Failed to revoke personal access token",
    id: "pAtRvFail01",
    description: "Error when revoking a personal access token fails",
  },
  revokedToast: {
    defaultMessage: "Personal access token revoked",
    id: "pAtRvToas01",
    description: "Success toast after revoking a personal access token",
  },
  copiedToast: {
    defaultMessage: "Token copied to clipboard",
    id: "pAtCpToas01",
    description: "Success toast after copying a newly created personal access token",
  },
  copyFailedToast: {
    defaultMessage: "Failed to copy to clipboard",
    id: "pAtCpFail01",
    description: "Error toast when clipboard copy of a personal access token fails",
  },
  pageLabel: {
    defaultMessage: "Account settings",
    id: "pAtPgLbl01",
    description: "Breadcrumb-style label above the personal access tokens page title",
  },
  pageTitle: {
    defaultMessage: "Personal access tokens",
    id: "pAtPgTtl01",
    description: "Personal access tokens settings page heading",
  },
  pageDescription: {
    defaultMessage:
      "Create tokens for the CLI, CI, and integrations. A token acts with your current workspace access and stops working if you leave the organization.",
    id: "pAtPgDsc01",
    description: "Personal access tokens settings page description",
  },
  pageDescriptionDetail: {
    defaultMessage:
      "Copy a new token immediately. You cannot view the secret again after you close this page.",
    id: "pAtPgDtl01",
    description: "Personal access tokens settings page note about one-time secret disclosure",
  },
  createButton: {
    defaultMessage: "Create token",
    id: "pAtCrBtn01",
    description: "Button to open the create personal access token dialog",
  },
  sectionAriaLabel: {
    defaultMessage: "Personal access tokens",
    id: "pAtSecLbl01",
    description: "Accessible label for the personal access tokens list section",
  },
  loading: {
    defaultMessage: "Loading personal access tokens...",
    id: "pAtLoading1",
    description: "Loading state while fetching personal access tokens",
  },
  loadErrorTitle: {
    defaultMessage: "Personal access tokens failed to load.",
    id: "pAtLdErrT1",
    description: "Error title when the personal access token list fails to load",
  },
  loadErrorFallback: {
    defaultMessage: "Refresh the page to try again.",
    id: "pAtLdErrF1",
    description: "Fallback error guidance when loading personal access tokens fails",
  },
  emptyTitle: {
    defaultMessage: "No personal access tokens yet",
    id: "pAtEmptyT1",
    description: "Empty state title when the signed-in user has no personal access tokens",
  },
  emptyDescription: {
    defaultMessage:
      "Create a token to authenticate scripts and integrations as yourself in this workspace.",
    id: "pAtEmptyD1",
    description: "Empty state description for the personal access tokens list",
  },
  maskedKeyPrefix: {
    defaultMessage: "{prefix}••••••••",
    id: "pAtMaskPf1",
    description: "Masked personal access token prefix shown in the tokens list",
  },
  permissions: {
    defaultMessage: "Permissions: {permissions}",
    id: "pAtPerms01",
    description: "Personal access token row showing granted permissions",
  },
  createdAt: {
    defaultMessage: "Created {date}",
    id: "pAtCreated1",
    description: "Personal access token row showing creation timestamp",
  },
  lastUsed: {
    defaultMessage: "Last used {date}",
    id: "pAtLstUsd1",
    description: "Personal access token row showing last-used timestamp",
  },
  revokedStatus: {
    defaultMessage: "Revoked",
    id: "pAtRevSts1",
    description: "Badge shown on a revoked personal access token",
  },
  revoke: {
    defaultMessage: "Revoke",
    id: "pAtRevoke1",
    description: "Button to open the revoke personal access token confirmation dialog",
  },
  createDialogTitle: {
    defaultMessage: "Create personal access token",
    id: "pAtCrDlgT1",
    description: "Title of the create personal access token dialog before the token is generated",
  },
  createdDialogTitle: {
    defaultMessage: "Personal access token created",
    id: "pAtCdDlgT1",
    description: "Title of the create personal access token dialog after the token is generated",
  },
  createDialogDescription: {
    defaultMessage:
      "Name the token and choose the scopes it may use. The token can only do what your current role allows.",
    id: "pAtCrDlgD1",
    description: "Description in the create personal access token dialog before generation",
  },
  createdDialogDescription: {
    defaultMessage: "Copy this token now. You will not be able to see it again.",
    id: "pAtCdDlgD1",
    description: "Warning shown after a personal access token is created",
  },
  copied: {
    defaultMessage: "Copied",
    id: "pAtCopied1",
    description: "Copy button label after the personal access token was copied",
  },
  copy: {
    defaultMessage: "Copy",
    id: "pAtCopy001",
    description: "Button to copy the newly created personal access token",
  },
  tokenNameLabel: {
    defaultMessage: "Token name",
    id: "pAtNameLb1",
    description: "Label for the personal access token name field",
  },
  tokenNamePlaceholder: {
    defaultMessage: "e.g. Local CLI",
    id: "pAtNamePh1",
    description: "Placeholder for the personal access token name field",
  },
  permissionsLegend: {
    defaultMessage: "Permissions",
    id: "pAtPermLg1",
    description: "Legend for the personal access token permission scope checkboxes",
  },
  permissionJobsRead: {
    defaultMessage: "Read jobs",
    id: "pAtScpJr01",
    description: "Label for the jobs:read personal access token scope",
  },
  permissionJobsWrite: {
    defaultMessage: "Write jobs",
    id: "pAtScpJw01",
    description: "Label for the jobs:write personal access token scope",
  },
  permissionFilesRead: {
    defaultMessage: "Read files",
    id: "pAtScpFr01",
    description: "Label for the files:read personal access token scope",
  },
  permissionFilesWrite: {
    defaultMessage: "Write files",
    id: "pAtScpFw01",
    description: "Label for the files:write personal access token scope",
  },
  done: {
    defaultMessage: "Done",
    id: "pAtDone001",
    description: "Button to close the create personal access token dialog after copying the token",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "pAtCancel1",
    description: "Cancel button in personal access token dialogs",
  },
  creating: {
    defaultMessage: "Creating...",
    id: "pAtCreating",
    description: "Create personal access token button label while the request is pending",
  },
  createToken: {
    defaultMessage: "Create token",
    id: "pAtCrSub01",
    description: "Submit button to create a personal access token",
  },
  revokeDialogTitle: {
    defaultMessage: "Revoke personal access token",
    id: "pAtRvDlgT1",
    description: "Title of the revoke personal access token confirmation dialog",
  },
  revokeDialogDescription: {
    defaultMessage:
      "Revoke {name} ({prefix}…)? Integrations using this token will lose access immediately.",
    id: "pAtRvDlgD1",
    description:
      "Description in the revoke personal access token confirmation dialog identifying the token",
  },
  revoking: {
    defaultMessage: "Revoking...",
    id: "pAtRevoking",
    description: "Revoke personal access token button label while the request is pending",
  },
  revokeToken: {
    defaultMessage: "Revoke token",
    id: "pAtRvCnf01",
    description: "Confirm button to revoke a personal access token",
  },
});
