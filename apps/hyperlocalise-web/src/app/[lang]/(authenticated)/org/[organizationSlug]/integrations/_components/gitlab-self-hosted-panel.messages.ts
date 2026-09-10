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

export const gitlabSelfHostedPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Self-hosted GitLab",
    id: "gitlabSelfHostedName",
    description: "Name shown for the self-hosted GitLab integrations row",
  },
  rowDescription: {
    defaultMessage:
      "Connect a self-hosted GitLab instance with a personal access token so automations and chat can clone projects.",
    id: "gitlabSelfHostedDescription",
    description: "Description for the self-hosted GitLab integrations row",
  },
  addConnection: {
    defaultMessage: "Add instance",
    id: "gitlabSelfHostedAdd",
    description: "Button to add a new self-hosted GitLab connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "gitlabSelfHostedDisplayName",
    description: "Label for self-hosted GitLab display name field",
  },
  baseUrlLabel: {
    defaultMessage: "Instance URL",
    id: "gitlabSelfHostedBaseUrl",
    description: "Label for self-hosted GitLab instance URL field",
  },
  baseUrlHelp: {
    defaultMessage: "Public HTTPS URL of your GitLab instance, for example https://gitlab.example.com. GitLab.com uses Pipes above.",
    id: "gitlabSelfHostedBaseUrlHelp",
    description: "Help text for the self-hosted GitLab instance URL",
  },
  accessTokenLabel: {
    defaultMessage: "Personal access token",
    id: "gitlabSelfHostedToken",
    description: "Label for self-hosted GitLab personal access token field",
  },
  accessTokenHelp: {
    defaultMessage: "Create a token with read_api and read_repository. Hyperlocalise clones over HTTPS as oauth2.",
    id: "gitlabSelfHostedTokenHelp",
    description: "Help text for self-hosted GitLab personal access token scopes",
  },
  save: {
    defaultMessage: "Save",
    id: "gitlabSelfHostedSave",
    description: "Save self-hosted GitLab connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "gitlabSelfHostedCancel",
    description: "Cancel adding a self-hosted GitLab connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "gitlabSelfHostedDelete",
    description: "Delete self-hosted GitLab connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load GitLab connections.",
    id: "gitlabSelfHostedFetchFailed",
    description: "Error when self-hosted GitLab connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save GitLab connection.",
    id: "gitlabSelfHostedSaveFailed",
    description: "Error when self-hosted GitLab connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "GitLab instance connected.",
    id: "gitlabSelfHostedSaveSucceeded",
    description: "Toast when a self-hosted GitLab connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete GitLab connection.",
    id: "gitlabSelfHostedDeleteFailed",
    description: "Error when self-hosted GitLab connection delete fails",
  },
  deleteInUse: {
    defaultMessage: "Remove this GitLab connection from automations before deleting it.",
    id: "gitlabSelfHostedDeleteInUse",
    description: "Error when deleting a GitLab connection still used by automations",
  },
  deleteSucceeded: {
    defaultMessage: "GitLab connection deleted.",
    id: "gitlabSelfHostedDeleteSucceeded",
    description: "Toast when a self-hosted GitLab connection is deleted",
  },
  tokenConfigured: {
    defaultMessage: "{baseUrl} · token ending in {suffix}",
    id: "gitlabSelfHostedTokenConfigured",
    description: "Hint that a GitLab instance URL and token are already stored",
  },
  accessTokenRequired: {
    defaultMessage: "Enter a GitLab personal access token.",
    id: "gitlabSelfHostedTokenRequired",
    description: "Validation error when GitLab access token is missing on create",
  },
  baseUrlRequired: {
    defaultMessage: "Enter a GitLab instance URL.",
    id: "gitlabSelfHostedBaseUrlRequired",
    description: "Validation error when GitLab instance URL is missing on create",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "gitlabSelfHostedEnabled",
    description: "Badge shown when a self-hosted GitLab connection is enabled",
  },
});
