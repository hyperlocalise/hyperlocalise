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
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";

export const gitlabIntegrationRowMessages = defineMessages({
  name: {
    defaultMessage: "GitLab",
    id: "ufjLSLmtEV",
    description: "GitLab integration name on the integrations page",
  },
  disconnectedDescription: {
    defaultMessage:
      "Connect GitLab so Hyperlocalise can inspect localized strings and pull project code into the agent sandbox.",
    id: "yo0hlXwcJG",
    description: "GitLab integration description before OAuth is connected",
  },
  projectSummary: {
    defaultMessage: "{enabledCount} of {totalCount} projects enabled.",
    id: "lSm82bVMM1",
    description: "Summary of enabled vs total GitLab projects",
  },
  connectedAsDescription: {
    defaultMessage: "Connected as {username}. {projectSummary}",
    id: "4n9MWE/EB4",
    description: "GitLab integration description when connected with a known username",
  },
  connectedDescription: {
    defaultMessage: "Connected. {projectSummary}",
    id: "6y0wjJnT+8",
    description: "GitLab integration description when connected without a username",
  },
  loadError: {
    defaultMessage: "Unable to load GitLab connection status right now.",
    id: "/DWbf2bjc8",
    description: "Error message when GitLab connection status fails to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "PLCHwI2iIl",
    description: "Button label to retry loading GitLab connection status",
  },
  refreshProjectListTitle: {
    defaultMessage:
      "Refresh the project list and metadata from GitLab. This does not push or pull translations.",
    id: "JVF/p9RCV5",
    description: "Tooltip for the refresh GitLab project list button",
  },
  refreshingProjectList: {
    defaultMessage: "Refreshing…",
    id: "soq32gJhrN",
    description: "Refresh project list button label while syncing",
  },
  refreshProjectList: {
    defaultMessage: "Refresh project list",
    id: "4tn8jiufAy",
    description: "Refresh GitLab project list button label",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "KZ6Aub56Ln",
    description: "Disconnect button label while GitLab is being disconnected",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "59CmstLCtJ",
    description: "Button label to disconnect GitLab",
  },
  searchProjectsPlaceholder: {
    defaultMessage: "Search projects",
    id: "6GMkBJ/xk+",
    description: "Placeholder for the GitLab project search input",
  },
  searchProjectsAriaLabel: {
    defaultMessage: "Search projects",
    id: "5S9w7k06P7",
    description: "Aria label for the GitLab project search input",
  },
  enableSelected: {
    defaultMessage: "Enable {count}",
    id: "YEkU03l7Kv",
    description: "Button label to enable the selected GitLab projects",
  },
  enableAll: {
    defaultMessage: "Enable all",
    id: "qIqGh8ydvd",
    description: "Button label to enable all GitLab projects",
  },
  enabledColumnSrOnly: {
    defaultMessage: "Enabled",
    id: "G0dVtrxWGP",
    description: "Screen reader label for the project enabled checkbox column",
  },
  projectsColumn: {
    defaultMessage: "Projects",
    id: "fm6cbSmF11",
    description: "Table header for GitLab project names",
  },
  branchColumn: {
    defaultMessage: "Branch",
    id: "5AkeE7XWLR",
    description: "Table header for default branch names",
  },
  enableProjectAriaLabel: {
    defaultMessage: "Enable {pathWithNamespace}",
    id: "jBx1RuRRoo",
    description: "Aria label for a GitLab project enable checkbox",
  },
  privateBadge: {
    defaultMessage: "Private",
    id: "fNmI0DFPxz",
    description: "Badge label for a private GitLab project",
  },
  archivedBadge: {
    defaultMessage: "Archived",
    id: "uWIhFX50Gv",
    description: "Badge label for an archived GitLab project",
  },
  defaultBranchFallback: {
    defaultMessage: "default",
    id: "2tRWNrsRyD",
    description: "Fallback label when a GitLab project has no default branch name",
  },
  noProjectsAvailable: {
    defaultMessage: "No projects are available to this GitLab account.",
    id: "+v42+JiQgJ",
    description: "Empty state when the GitLab connection exposes no projects",
  },
  noProjectsMatchSearch: {
    defaultMessage: "No projects match this search.",
    id: "QP1g5T8XXI",
    description: "Empty state when GitLab project search returns no results",
  },
  projectListRefreshedToast: {
    defaultMessage: "GitLab project list refreshed",
    id: "Wx+6MZC1QV",
    description: "Toast after syncing the GitLab project list",
  },
  enabledProjectsUpdatedToast: {
    defaultMessage: "Enabled projects updated",
    id: "tzFsU4lwkT",
    description: "Toast after updating enabled GitLab projects",
  },
  disconnectedToast: {
    defaultMessage: "GitLab disconnected",
    id: "6fghH/OKqO",
    description: "Toast after disconnecting GitLab",
  },
  connectedToast: {
    defaultMessage: "GitLab connected",
    id: "BQTlzkaPo7",
    description: "Toast after returning from successful GitLab OAuth connection",
  },
  installUrlFailedToast: {
    defaultMessage: "Failed to generate GitLab authorize URL",
    id: "uY0VM2SFys",
    description: "Toast when GitLab OAuth authorize URL generation fails",
  },
  connectFailedFallback: {
    defaultMessage: "GitLab connection failed. Try connecting again.",
    id: "weEvqF4ZTf",
    description: "Fallback toast when GitLab connection fails with an unknown error code",
  },
  missingGitlabState: {
    defaultMessage: "GitLab did not return OAuth state. Try connecting again from this page.",
    id: "/9TAJzLr2u",
    description: "GitLab connect error when OAuth state is missing",
  },
  invalidGitlabState: {
    defaultMessage:
      "The GitLab connect link expired or was already used. Click Connect again from this page.",
    id: "fefiQV5IGD",
    description: "GitLab connect error when OAuth state is invalid or expired",
  },
  gitlabOauthNotConfigured: {
    defaultMessage: "GitLab OAuth integration is not configured for this environment.",
    id: "h0TXwg+t0h",
    description: "GitLab connect error when OAuth credentials are not configured",
  },
  gitlabOauthFailed: {
    defaultMessage: "GitLab rejected the OAuth authorization. Try connecting again.",
    id: "9+KwzHAYas",
    description: "GitLab connect error when token exchange or user fetch fails",
  },
  gitlabAccessDenied: {
    defaultMessage: "GitLab access was denied. Approve the requested scopes and try again.",
    id: "4OeSuDpphA",
    description: "GitLab connect error when the user denies authorization",
  },
  missingGitlabCode: {
    defaultMessage: "GitLab did not return an authorization code. Try connecting again.",
    id: "cq0VR9JnMQ",
    description: "GitLab connect error when authorization code is missing",
  },
  gitlabAccountAlreadyConnected: {
    defaultMessage: "That GitLab account is already linked to another Hyperlocalise organization.",
    id: "zSKvS9ymHS",
    description: "GitLab connect error when account is linked to another organization",
  },
  workspaceResourceLimitReached: {
    defaultMessage: "Integration limit reached for your current plan.",
    id: "eyjXCrIP8+",
    description: "GitLab connect error when workspace integration limit is reached",
  },
  gitlabProjectSyncFailed: {
    defaultMessage:
      "GitLab was connected, but the project list could not be refreshed. Try refreshing the project list.",
    id: "+D5jicWbYL",
    description: "GitLab connect error when OAuth succeeded but the initial project sync failed",
  },
  forbidden: {
    defaultMessage: "You do not have permission to connect GitLab for this organization.",
    id: "Nt5/wQGA4/",
    description: "GitLab connect error when the user lacks operator role",
  },
});

const GITLAB_CONNECT_ERROR_MESSAGES: Record<string, MessageDescriptor> = {
  missing_gitlab_state: gitlabIntegrationRowMessages.missingGitlabState,
  invalid_gitlab_state: gitlabIntegrationRowMessages.invalidGitlabState,
  gitlab_oauth_not_configured: gitlabIntegrationRowMessages.gitlabOauthNotConfigured,
  gitlab_oauth_failed: gitlabIntegrationRowMessages.gitlabOauthFailed,
  gitlab_access_denied: gitlabIntegrationRowMessages.gitlabAccessDenied,
  missing_gitlab_code: gitlabIntegrationRowMessages.missingGitlabCode,
  gitlab_account_already_connected: gitlabIntegrationRowMessages.gitlabAccountAlreadyConnected,
  gitlab_workspace_resource_limit_reached:
    gitlabIntegrationRowMessages.workspaceResourceLimitReached,
  gitlab_project_sync_failed: gitlabIntegrationRowMessages.gitlabProjectSyncFailed,
  gitlab_forbidden: gitlabIntegrationRowMessages.forbidden,
};

export function getGitlabConnectErrorMessage(intl: IntlShape, errorCode: string): string {
  const message = GITLAB_CONNECT_ERROR_MESSAGES[errorCode];
  if (message) {
    return intl.formatMessage(message);
  }

  return intl.formatMessage(gitlabIntegrationRowMessages.connectFailedFallback);
}
