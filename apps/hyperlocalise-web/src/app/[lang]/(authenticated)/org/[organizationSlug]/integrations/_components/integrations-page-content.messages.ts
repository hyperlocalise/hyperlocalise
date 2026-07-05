"use client";

import { defineMessages } from "react-intl";

export const integrationsPageContentMessages = defineMessages({
  pageTitle: {
    defaultMessage: "Integrations",
    id: "9glYgHRgqB",
    description: "Integrations page heading",
  },
  workspaceLevelBadge: {
    defaultMessage: "Workspace level",
    id: "rywDd6XWpM",
    description: "Badge indicating integrations apply to the whole workspace",
  },
  tmsCategory: {
    defaultMessage: "Translation Management System",
    id: "AvXpNmaez+",
    description: "Integrations page section heading for TMS providers",
  },
  cmsCategory: {
    defaultMessage: "Content Management System",
    id: "dWHU+zjwUO",
    description: "Integrations page section heading for CMS connectors",
  },
  modelProviderCategory: {
    defaultMessage: "Model provider",
    id: "E6HRzAiOt0",
    description: "Integrations page section heading for LLM providers",
  },
  hyperlocaliseGoLabel: {
    defaultMessage: "Hyperlocalise GO",
    id: "Qkra2VNwUo",
    description: "Managed Hyperlocalise model provider name",
  },
  hyperlocaliseGoDescription: {
    defaultMessage: "Managed by Hyperlocalise",
    id: "tHJT8VDfIn",
    description: "Managed Hyperlocalise model provider description",
  },
  openAiLabel: {
    defaultMessage: "Open AI",
    id: "0kqhhOMa9k",
    description: "OpenAI BYOK provider name on the integrations page",
  },
  openAiDescription: {
    defaultMessage: "Connect your OpenAI account",
    id: "QmXtxyLvCd",
    description: "OpenAI BYOK provider description on the integrations page",
  },
  anthropicLabel: {
    defaultMessage: "Anthropic",
    id: "1VNZg9UkcM",
    description: "Anthropic BYOK provider name on the integrations page",
  },
  anthropicDescription: {
    defaultMessage: "Connect your Anthropic account",
    id: "4tP9x2ODN4",
    description: "Anthropic BYOK provider description on the integrations page",
  },
  geminiLabel: {
    defaultMessage: "Google Gemini",
    id: "l0d6YXPPZ9",
    description: "Google Gemini BYOK provider name on the integrations page",
  },
  geminiDescription: {
    defaultMessage: "Connect your Gemini account",
    id: "R+hZLscXuo",
    description: "Google Gemini BYOK provider description on the integrations page",
  },
  tmsNativeName: {
    defaultMessage: "Hyperlocalise Native",
    id: "Ij4qN1o4kr",
    description: "Built-in TMS integration name on the integrations page",
  },
  tmsNativeDetail: {
    defaultMessage:
      "Built-in TMS for projects, jobs, files, and translation memories. No external provider required.",
    id: "ayMjHyvmox",
    description: "Built-in TMS integration description on the integrations page",
  },
  tmsCrowdinName: {
    defaultMessage: "Crowdin",
    id: "b1aqjjuIqX",
    description: "Crowdin TMS integration name on the integrations page",
  },
  tmsCrowdinDetail: {
    defaultMessage:
      "Connect to browse Crowdin projects alongside native Hyperlocalise projects. Project and job data is read live from Crowdin when you open it.",
    id: "F63lYTb8dq",
    description: "Crowdin TMS integration description on the integrations page",
  },
  tmsLokaliseName: {
    defaultMessage: "Lokalise",
    id: "7bhDbepHzq",
    description: "Lokalise TMS integration name on the integrations page",
  },
  tmsLokaliseDetail: {
    defaultMessage:
      "Connect to browse Lokalise projects, tasks, glossaries, and translation memories with user OAuth.",
    id: "KsWSfbuaLd",
    description: "Lokalise TMS integration description on the integrations page",
  },
  tmsPhraseName: {
    defaultMessage: "Phrase",
    id: "PNU13RfDla",
    description: "Phrase TMS integration name on the integrations page",
  },
  tmsPhraseDetail: {
    defaultMessage: "Connect to browse Phrase projects and jobs with user OAuth.",
    id: "HsI1Rbh6Cp",
    description: "Phrase TMS integration description on the integrations page",
  },
  tmsSmartlingName: {
    defaultMessage: "Smartling",
    id: "7nMUUnudcv",
    description: "Smartling TMS integration name on the integrations page",
  },
  tmsSmartlingDetail: {
    defaultMessage: "Connect enterprise localization programs.",
    id: "4HsCO20k/1",
    description: "Smartling TMS integration description on the integrations page",
  },
  contentfulName: {
    defaultMessage: "Contentful",
    id: "msm7HmNNfJ",
    description: "Contentful CMS integration name on the integrations page",
  },
  contentfulDetail: {
    defaultMessage: "CMS connector for agentic article translation and draft writeback.",
    id: "YrDOYyksrv",
    description: "Contentful CMS integration description on the integrations page",
  },
  viewProjects: {
    defaultMessage: "View projects",
    id: "umhjXIiCiC",
    description: "Button label linking to native TMS projects",
  },
  disconnectTmsTooltip: {
    defaultMessage: "Disconnect the current TMS to switch providers.",
    id: "tSnciLV1cq",
    description: "Tooltip when another TMS provider blocks connecting this one",
  },
  providerSavedToast: {
    defaultMessage: "{providerLabel} provider saved",
    id: "nmfgIZNX5m",
    description: "Toast after saving a BYOK LLM provider credential",
  },
  llmProviderDisconnectedToast: {
    defaultMessage: "LLM provider disconnected",
    id: "kDfywMCo7J",
    description: "Toast after disconnecting the workspace LLM provider",
  },
  externalTmsConnectedToast: {
    defaultMessage: "{displayName} connected",
    id: "V1BIkH6W+O",
    description: "Toast after connecting an external TMS provider",
  },
  crowdinPatSavedConnectTokenToast: {
    defaultMessage: "{displayName} saved. Connect your Crowdin token to continue.",
    id: "/0FWG2SoFG",
    description: "Toast after saving Crowdin PAT settings when user token is still required",
  },
  settingsSavedToast: {
    defaultMessage: "{displayName} settings saved",
    id: "nDPeOs1MH9",
    description: "Toast after saving TMS OAuth or PAT settings",
  },
  crowdinOAuthSavedConnectAccountToast: {
    defaultMessage: "{displayName} saved. Connect your Crowdin account to continue.",
    id: "C+9nUAd/Jd",
    description: "Toast after saving Crowdin OAuth app when user OAuth is still required",
  },
  phraseOAuthSavedConnectAccountToast: {
    defaultMessage: "{displayName} saved. Connect your Phrase account to continue.",
    id: "C7FCjLc6gc",
    description: "Toast after saving Phrase OAuth app when user OAuth is still required",
  },
  lokaliseOAuthSavedConnectAccountToast: {
    defaultMessage: "{displayName} saved. Connect your Lokalise account to continue.",
    id: "4DV7znCLLI",
    description: "Toast after saving Lokalise OAuth app when user OAuth is still required",
  },
  providerDisconnectedToast: {
    defaultMessage: "Provider disconnected",
    id: "rO3KPnsZEO",
    description: "Toast after disconnecting an external TMS provider",
  },
  switchToManagedFooter: {
    defaultMessage: "Switch to managed",
    id: "CIdkhlQIV6",
    description: "Footer label on managed model provider card when BYOK is active",
  },
  configureFooter: {
    defaultMessage: "Configure",
    id: "If/xnDCxst",
    description: "Footer label on BYOK model provider cards",
  },
  configureDialogTitle: {
    defaultMessage: "Configure {providerLabel}",
    id: "Y7XT7zpg39",
    description: "Title for the BYOK model provider configuration dialog",
  },
  configureDialogDescription: {
    defaultMessage:
      "Save one shared provider key for this workspace. Saving validates the key, encrypts it at rest, and replaces the current provider.",
    id: "uMS3Md9f77",
    description: "Description for the BYOK model provider configuration dialog",
  },
  defaultModelLabel: {
    defaultMessage: "Default model",
    id: "BsIdlB/bdk",
    description: "Label for the default model select field",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "znjMm102W+",
    description: "Label for the provider API key input",
  },
  apiKeyPlaceholder: {
    defaultMessage: "Enter {providerLabel} API key",
    id: "tlMl5v6nnm",
    description: "Placeholder for the provider API key input",
  },
  hideApiKeyAriaLabel: {
    defaultMessage: "Hide API key",
    id: "98mLYv90ox",
    description: "Aria label for the button that hides the API key input",
  },
  showApiKeyAriaLabel: {
    defaultMessage: "Show API key",
    id: "2BaYUyVX1c",
    description: "Aria label for the button that reveals the API key input",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "ntvyMHkHZg",
    description: "Button label while disconnecting a provider",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "PJoDNnwjRj",
    description: "Button label to disconnect a provider",
  },
  validating: {
    defaultMessage: "Validating…",
    id: "2BoI5eES6X",
    description: "Button label while validating a provider credential",
  },
  saveProvider: {
    defaultMessage: "Save provider",
    id: "NBLnrSCLwC",
    description: "Button label to save a BYOK provider credential",
  },
  disconnectTmsDialogTitle: {
    defaultMessage: "Disconnect {providerName}?",
    id: "BX0DlJwbY+",
    description: "Title for the external TMS disconnect confirmation dialog",
  },
  disconnectTmsDialogTitleFallback: {
    defaultMessage: "TMS provider",
    id: "dY8L59VF27",
    description: "Fallback provider name in the TMS disconnect dialog title",
  },
  disconnectTmsDialogDescription: {
    defaultMessage:
      "This removes the saved encrypted provider credentials. Reconnecting this provider will require entering the secret again.",
    id: "pM8pgX4u47",
    description: "Description for the external TMS disconnect confirmation dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "wIG4YNHURU",
    description: "Cancel button in the TMS disconnect confirmation dialog",
  },
  contentfulHelpCenterDefaultName: {
    defaultMessage: "Contentful Help Center",
    id: "w9jgu/gyZT",
    description: "Default display name for a new Contentful CMS connection",
  },
});
