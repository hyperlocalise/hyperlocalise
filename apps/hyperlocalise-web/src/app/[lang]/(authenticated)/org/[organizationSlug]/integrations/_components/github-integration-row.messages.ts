"use client";

import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";

export const githubIntegrationRowMessages = defineMessages({
  name: {
    defaultMessage: "GitHub",
    id: "9phIm1BV0j",
    description: "GitHub integration name on the integrations page",
  },
  disconnectedDescription: {
    defaultMessage:
      "Connect GitHub for pull request reviews, localization fixes, and repository context.",
    id: "+xOXD4ARmA",
    description: "GitHub integration description before the app is connected",
  },
  repoSummary: {
    defaultMessage: "{enabledCount} of {totalCount} repositories enabled.",
    id: "MZotM1J5qc",
    description: "Summary of enabled vs total GitHub repositories",
  },
  connectedAsDescription: {
    defaultMessage: "Connected as {accountLogin}. {repoSummary}",
    id: "rqH4qSNbvK",
    description: "GitHub integration description when connected with a known account login",
  },
  connectedDescription: {
    defaultMessage: "Connected. {repoSummary}",
    id: "4Ot6qB+D/E",
    description: "GitHub integration description when connected without a known account login",
  },
  loadError: {
    defaultMessage: "Unable to load GitHub installation status right now.",
    id: "3M+guxg4Ll",
    description: "Error message when GitHub installation status fails to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "bHpDk7ICgp",
    description: "Button label to retry loading GitHub installation status",
  },
  manageAccessOnGitHub: {
    defaultMessage: "Manage access on GitHub",
    id: "M3bbV5wmi2",
    description: "Button label to open GitHub installation settings",
  },
  refreshRepoListTitle: {
    defaultMessage:
      "Refresh the repository list and metadata from GitHub. This does not push or pull translations.",
    id: "WA49vhY6w5",
    description: "Tooltip for the refresh repository list button",
  },
  refreshingRepoList: {
    defaultMessage: "Refreshing…",
    id: "gg+xut28LR",
    description: "Refresh repository list button label while syncing",
  },
  refreshRepoList: {
    defaultMessage: "Refresh repo list",
    id: "bubst9Dzg+",
    description: "Refresh repository list button label",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "JEdlCIcj1G",
    description: "Disconnect button label while GitHub is being disconnected",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "ljEJGwxPd/",
    description: "Button label to disconnect GitHub",
  },
  searchRepositoriesPlaceholder: {
    defaultMessage: "Search repositories",
    id: "f0pASu5TFR",
    description: "Placeholder for the GitHub repository search input",
  },
  searchRepositoriesAriaLabel: {
    defaultMessage: "Search repositories",
    id: "Zq6yckXsZ1",
    description: "Aria label for the GitHub repository search input",
  },
  enableSelected: {
    defaultMessage: "Enable {count}",
    id: "Lps9d8jAkf",
    description: "Button label to enable the selected GitHub repositories",
  },
  enableAll: {
    defaultMessage: "Enable all",
    id: "/cgIKQ7r8o",
    description: "Button label to enable all GitHub repositories",
  },
  enabledColumnSrOnly: {
    defaultMessage: "Enabled",
    id: "zztNzAuBoJ",
    description: "Screen reader label for the repository enabled checkbox column",
  },
  repositoriesColumn: {
    defaultMessage: "Repositories",
    id: "/d8vf0Z+2x",
    description: "Table header for GitHub repository names",
  },
  branchColumn: {
    defaultMessage: "Branch",
    id: "5AkeE7XWLR",
    description: "Table header for default branch names",
  },
  actionColumn: {
    defaultMessage: "Action",
    id: "M1dHMgqYPX",
    description: "Table header for per-repository actions",
  },
  enableRepositoryAriaLabel: {
    defaultMessage: "Enable {repositoryFullName}",
    id: "VpKHsNzJ6d",
    description: "Aria label for a repository enable checkbox",
  },
  privateBadge: {
    defaultMessage: "Private",
    id: "mMp/zOre+X",
    description: "Badge label for a private GitHub repository",
  },
  archivedBadge: {
    defaultMessage: "Archived",
    id: "+3ic9geD5G",
    description: "Badge label for an archived GitHub repository",
  },
  defaultBranchFallback: {
    defaultMessage: "default",
    id: "wUKFu5cEaD",
    description: "Fallback label when a repository has no default branch name",
  },
  noRepositoriesAvailable: {
    defaultMessage: "No repositories are available to this GitHub App installation.",
    id: "PRbdh+Ryiw",
    description: "Empty state when the GitHub App installation exposes no repositories",
  },
  noRepositoriesMatchSearch: {
    defaultMessage: "No repositories match this search.",
    id: "Co6OZgcHjk",
    description: "Empty state when repository search returns no results",
  },
  repositoryListRefreshedToast: {
    defaultMessage: "GitHub repository list refreshed",
    id: "YfETsADG9Z",
    description: "Toast after syncing the GitHub repository list",
  },
  enabledRepositoriesUpdatedToast: {
    defaultMessage: "Enabled repositories updated",
    id: "zM/fYyJiHY",
    description: "Toast after updating enabled GitHub repositories",
  },
  disconnectedToast: {
    defaultMessage: "GitHub disconnected",
    id: "3ml8Juvu7i",
    description: "Toast after disconnecting GitHub",
  },
  connectedToast: {
    defaultMessage: "GitHub connected",
    id: "pj6HuYI/BY",
    description: "Toast after returning from successful GitHub App installation",
  },
  installUrlFailedToast: {
    defaultMessage: "Failed to generate GitHub install URL",
    id: "9pmdbGAxZ4",
    description: "Toast when GitHub App install URL generation fails",
  },
  connectFailedFallback: {
    defaultMessage: "GitHub App connection failed. Try connecting again.",
    id: "/5pMziffIK",
    description: "Fallback toast when GitHub App connection fails with an unknown error code",
  },
  missingCallbackParams: {
    defaultMessage:
      "GitHub did not return installation_id on the Setup URL callback. Confirm the GitHub App Setup URL points to this app and try connecting again.",
    id: "udWuegdP+q",
    description: "GitHub connect error when callback params are missing",
  },
  invalidState: {
    defaultMessage:
      "The GitHub install link expired or was already used. Click Connect again from this page.",
    id: "nwJGCHKaPx",
    description: "GitHub connect error when OAuth state is invalid or expired",
  },
  githubInstallPendingApproval: {
    defaultMessage:
      "GitHub is waiting for an org owner to approve this app install. Approve it on GitHub, then connect again.",
    id: "pdHOl1weOs",
    description: "GitHub connect error when installation awaits org owner approval",
  },
  githubAppNotConfigured: {
    defaultMessage: "GitHub App integration is not configured for this environment.",
    id: "7BA/WdUPFq",
    description: "GitHub connect error when GitHub App credentials are not configured",
  },
  githubAppPrivateKeyInvalid: {
    defaultMessage:
      "GitHub rejected the app credentials in this environment. Set GITHUB_APP_ID to the App ID from GitHub App settings and GITHUB_APP_PRIVATE_KEY to the matching PEM (use literal \\n line breaks or base64-encode the whole file).",
    id: "adEnn5Hnc9",
    description: "GitHub connect error when GitHub App private key is invalid",
  },
  githubInstallationInvalid: {
    defaultMessage:
      "GitHub rejected the installation ID. Confirm the app is installed on the expected account.",
    id: "5nl3kRCtNh",
    description: "GitHub connect error when installation ID is invalid",
  },
  githubInstallationAlreadyLinked: {
    defaultMessage:
      "That GitHub installation is already linked to another Hyperlocalise organization.",
    id: "glSxg8oQcE",
    description: "GitHub connect error when installation is linked to another organization",
  },
  organizationNotFound: {
    defaultMessage: "The organization for this install request could not be found.",
    id: "P4BtYAEPF2",
    description: "GitHub connect error when organization cannot be resolved",
  },
  githubUseSetupUrl: {
    defaultMessage:
      'GitHub returned a user OAuth code instead of an installation ID. In GitHub App settings, turn off "Request user authorization (OAuth) during installation" and set the Setup URL to this app\'s /auth/github/callback.',
    id: "SBi1hajIEG",
    description: "GitHub connect error when OAuth code is returned instead of installation ID",
  },
});

const GITHUB_CONNECT_ERROR_MESSAGES: Record<string, MessageDescriptor> = {
  missing_callback_params: githubIntegrationRowMessages.missingCallbackParams,
  invalid_state: githubIntegrationRowMessages.invalidState,
  github_install_pending_approval: githubIntegrationRowMessages.githubInstallPendingApproval,
  github_app_not_configured: githubIntegrationRowMessages.githubAppNotConfigured,
  github_app_private_key_invalid: githubIntegrationRowMessages.githubAppPrivateKeyInvalid,
  github_installation_invalid: githubIntegrationRowMessages.githubInstallationInvalid,
  github_installation_already_linked: githubIntegrationRowMessages.githubInstallationAlreadyLinked,
  organization_not_found: githubIntegrationRowMessages.organizationNotFound,
  github_use_setup_url: githubIntegrationRowMessages.githubUseSetupUrl,
};

export function getGithubConnectErrorMessage(intl: IntlShape, errorCode: string): string {
  const message = GITHUB_CONNECT_ERROR_MESSAGES[errorCode];
  if (message) {
    return intl.formatMessage(message);
  }

  return intl.formatMessage(githubIntegrationRowMessages.connectFailedFallback);
}
