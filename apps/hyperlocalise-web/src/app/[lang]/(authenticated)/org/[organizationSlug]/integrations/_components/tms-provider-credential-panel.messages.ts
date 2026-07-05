"use client";

import { defineMessages } from "react-intl";

export const tmsProviderCredentialPanelMessages = defineMessages({
  oauthCallbackUrlLabel: {
    defaultMessage: "OAuth callback URL",
    id: "vLTwfBOTEg",
    description: "Label for the OAuth callback URL field in TMS provider setup",
  },
  oauthCallbackUrlAriaLabel: {
    defaultMessage: "OAuth callback URL",
    id: "2yOh43qm8U",
    description: "Aria label for the read-only OAuth callback URL field",
  },
  copiedOAuthCallbackUrlAriaLabel: {
    defaultMessage: "Copied OAuth callback URL",
    id: "naWIsHiFkQ",
    description: "Aria label after copying the OAuth callback URL",
  },
  copyOAuthCallbackUrlAriaLabel: {
    defaultMessage: "Copy OAuth callback URL",
    id: "t6Jk21Xb6m",
    description: "Aria label for the copy OAuth callback URL button",
  },
  copiedTooltip: {
    defaultMessage: "Copied!",
    id: "qMoIwNM0g+",
    description: "Tooltip after copying the OAuth callback URL",
  },
  copyOAuthCallbackUrlTooltip: {
    defaultMessage: "Copy OAuth callback URL",
    id: "hdt51o9xzu",
    description: "Tooltip for the copy OAuth callback URL button",
  },
  requiredOAuthScopesTitle: {
    defaultMessage: "Required OAuth scopes",
    id: "2zhZzc+gaw",
    description: "Heading for the OAuth scope checklist in TMS provider setup",
  },
  crowdinOAuthScopesDescription: {
    defaultMessage:
      "In your Crowdin OAuth App, enable every scope below. Hyperlocalise requests the same list when you connect Crowdin.",
    id: "E5p3SqvCuO",
    description: "Intro text for Crowdin OAuth scope requirements",
  },
  phraseOAuthScopesDescription: {
    defaultMessage:
      "Phrase TMS OAuth uses the scope below when Hyperlocalise requests an authorization code and exchanges it for a user bearer token.",
    id: "SQRLgyMjtO",
    description: "Intro text for Phrase OAuth scope requirements",
  },
  oauthClientIdLabel: {
    defaultMessage: "OAuth client ID",
    id: "uBs3qiwQrd",
    description: "Label for the OAuth client ID field",
  },
  oauthClientIdPlaceholderKeep: {
    defaultMessage: "Leave blank to keep existing client ID",
    id: "v9ol+HRqV1",
    description: "Placeholder when updating OAuth credentials without changing client ID",
  },
  oauthClientIdPlaceholderNew: {
    defaultMessage: "{providerName} OAuth App client ID",
    id: "vWISliHekQ",
    description: "Placeholder for a new OAuth client ID",
  },
  oauthClientSecretLabel: {
    defaultMessage: "OAuth client secret",
    id: "wc8eM+CF/N",
    description: "Label for the OAuth client secret field",
  },
  oauthClientSecretPlaceholderKeep: {
    defaultMessage: "Leave blank to keep existing client secret",
    id: "NMG/zBLWDQ",
    description: "Placeholder when updating OAuth credentials without changing client secret",
  },
  oauthClientSecretPlaceholderNew: {
    defaultMessage: "{providerName} OAuth App client secret",
    id: "Zgi1lh5USb",
    description: "Placeholder for a new OAuth client secret",
  },
  hideSecretAriaLabel: {
    defaultMessage: "Hide secret",
    id: "VSVVptSaLR",
    description: "Aria label for hiding a credential secret field",
  },
  showSecretAriaLabel: {
    defaultMessage: "Show secret",
    id: "2IX5Zk4LCM",
    description: "Aria label for revealing a credential secret field",
  },
  baseUrlGuidanceCrowdin: {
    defaultMessage:
      "Leave blank for Crowdin.com. For Crowdin Enterprise, use your organization API URL including /api/v2, for example https://yourorg.api.crowdin.com/api/v2. A trailing slash is optional.",
    id: "LCvdY0etjh",
    description: "Guidance for the Crowdin API base URL field",
  },
  baseUrlGuidancePhrase: {
    defaultMessage:
      "Leave blank for Phrase Cloud. For a custom Phrase TMS host, enter the full web API base URL, for example https://cloud.memsource.com/web.",
    id: "NuOuhehPIz",
    description: "Guidance for the Phrase API base URL field",
  },
  baseUrlGuidanceLokalise: {
    defaultMessage:
      "Leave blank for the standard Lokalise API. For a custom host, include the /api2 path, for example https://api.lokalise.com/api2.",
    id: "hvxzMXw+ek",
    description: "Guidance for the Lokalise API base URL field",
  },
  baseUrlGuidanceSmartling: {
    defaultMessage:
      "Leave blank for the standard Smartling API. For a custom host, include the auth API path, for example https://api.smartling.com/auth-api/v2.",
    id: "anZVyDdEfq",
    description: "Guidance for the Smartling API base URL field",
  },
  baseUrlPlaceholderCrowdin: {
    defaultMessage: "https://yourorg.api.crowdin.com/api/v2",
    id: "NagMPC+eb9",
    description: "Example placeholder for the Crowdin API base URL field",
  },
  baseUrlPlaceholderPhrase: {
    defaultMessage: "https://cloud.memsource.com/web",
    id: "9hphmwIx1l",
    description: "Example placeholder for the Phrase API base URL field",
  },
  baseUrlPlaceholderLokalise: {
    defaultMessage: "https://api.lokalise.com/api2",
    id: "y7TyDgtZHB",
    description: "Example placeholder for the Lokalise API base URL field",
  },
  baseUrlPlaceholderSmartling: {
    defaultMessage: "https://api.smartling.com/auth-api/v2",
    id: "aGXP2V6FOj",
    description: "Example placeholder for the Smartling API base URL field",
  },
  oauthConnectedTitle: {
    defaultMessage: "{providerName} is connected via OAuth",
    id: "YvOtHkprF2",
    description: "Status heading when a TMS provider is connected with OAuth",
  },
  oauthConnectedDescription: {
    defaultMessage:
      "Each workspace member connects their own {providerName} account. Projects, jobs, glossaries, and translation memories load live from {providerName} when you open those pages.",
    id: "QfmZdcP/TR",
    description: "Status description when a TMS provider is connected with OAuth",
  },
  accessTokenExpires: {
    defaultMessage: "Access token expires {expiresAt}",
    id: "nJvRveEDal",
    description: "Shows when the stored OAuth access token expires",
  },
  patConnectedTitle: {
    defaultMessage: "{providerName} is ready for member tokens",
    id: "svD7SMchJb",
    description: "Status heading when Crowdin PAT mode is configured",
  },
  patConnectedDescription: {
    defaultMessage:
      "The API base URL is saved for this workspace. Each member connects with their own Crowdin personal access token—no OAuth app required.",
    id: "J/94oLjLEp",
    description: "Status description when Crowdin PAT mode is configured",
  },
  authenticationMethodLabel: {
    defaultMessage: "Authentication method",
    id: "8bpns6mW0p",
    description: "Label for the Crowdin authentication method selector",
  },
  authenticationMethodDescription: {
    defaultMessage:
      "OAuth works when your Enterprise OAuth app is configured. Personal access tokens let each member paste a token from Crowdin without OAuth setup.",
    id: "CzW/0u2+bW",
    description: "Description for the Crowdin authentication method selector",
  },
  oauthAppRecommended: {
    defaultMessage: "OAuth app (recommended)",
    id: "TOuqvBUuy6",
    description: "Crowdin authentication option for OAuth apps",
  },
  personalAccessTokenOption: {
    defaultMessage: "Personal access token (per member)",
    id: "3zJmjtu7XF",
    description: "Crowdin authentication option for personal access tokens",
  },
  connectOAuthIntro: {
    defaultMessage:
      "Connect {providerName} with an OAuth App. Each member links their own account before using {providerName} data in Hyperlocalise.",
    id: "mDYRJWtk3P",
    description: "Intro text before connecting an OAuth-based TMS provider",
  },
  crowdinPatIntro: {
    defaultMessage:
      "Set the Crowdin API base URL once for this workspace. After you save, members connect by pasting their own personal access token—nothing else to configure.",
    id: "p0T+Rt+a+4",
    description: "Intro text before enabling Crowdin personal access token mode",
  },
  saveCredentialsIntro: {
    defaultMessage:
      "Save credentials to connect {providerName}. The secret is encrypted at rest and used to sync projects, files, and jobs into the workspace.",
    id: "YOCao9EtJ4",
    description: "Intro text before saving API token credentials for a TMS provider",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "ACud1VtN9i",
    description: "Label for the TMS provider credential display name field",
  },
  displayNamePlaceholder: {
    defaultMessage: "e.g. Crowdin Production",
    id: "wYUzxhVyTO",
    description: "Placeholder for the TMS provider credential display name field",
  },
  apiBaseUrlLabel: {
    defaultMessage: "API base URL",
    id: "ggrU8wuuic",
    description: "Label for the required API base URL field in Crowdin PAT mode",
  },
  reconnectOAuthApp: {
    defaultMessage: "Reconnect with a different OAuth app",
    id: "tQNKmwbVHc",
    description: "Collapsible trigger to replace OAuth app credentials",
  },
  apiTokenSecretLabel: {
    defaultMessage: "API token / secret",
    id: "yHXzQ/SrSE",
    description: "Label for the API token or secret field",
  },
  apiTokenPlaceholder: {
    defaultMessage: "Enter provider API token",
    id: "BVsezPmDFQ",
    description: "Placeholder for the API token or secret field",
  },
  advancedSettings: {
    defaultMessage: "Advanced settings",
    id: "3lnMAqI5qB",
    description: "Collapsible trigger for optional TMS provider settings",
  },
  baseUrlOptionalLabel: {
    defaultMessage: "Base URL (optional)",
    id: "iIDH8DJhzI",
    description: "Label for the optional API base URL field",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "ljCRNx6fjZ",
    description: "Button to remove a stored TMS provider credential",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "NjO8LhO0p7",
    description: "Save button label while TMS provider credentials are saving",
  },
  saveProviderSettings: {
    defaultMessage: "Save {providerName} settings",
    id: "XIKJG5Q5Cf",
    description: "Save button label when updating an existing TMS provider connection",
  },
  enableProviderTokens: {
    defaultMessage: "Enable {providerName} tokens",
    id: "5A/N2rMBQL",
    description: "Save button label when enabling Crowdin personal access token mode",
  },
  updateProvider: {
    defaultMessage: "Update {providerName}",
    id: "cgwAYz/R89",
    description: "Save button label when reconnecting with new OAuth credentials",
  },
  saveProvider: {
    defaultMessage: "Save {providerName}",
    id: "ajjoHt03BE",
    description: "Save button label when connecting a new OAuth-based TMS provider",
  },
  saveProviderGeneric: {
    defaultMessage: "Save provider",
    id: "bqM/HZdSBC",
    description: "Save button label for non-OAuth TMS providers",
  },
  oauthCallbackUrlCopiedToast: {
    defaultMessage: "OAuth callback URL copied",
    id: "z4vfspWg4+",
    description: "Toast after copying the OAuth callback URL",
  },
});
