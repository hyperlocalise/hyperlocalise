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

export const aiEnginePageContentMessages = defineMessages({
  pageTitle: {
    defaultMessage: "AI Engine",
    id: "YEHmCLlYeR",
    description: "AI Engine page heading",
  },
  pageDescription: {
    defaultMessage:
      "Connect one or more model providers and set the workspace default for Hyperlocalise Agent. Included models stay available even when BYOK providers are connected.",
    id: "6du8XKbuUv",
    description: "AI Engine page description",
  },
  providerSectionTitle: {
    defaultMessage: "Provider",
    id: "Niev/tzFno",
    description: "Section heading for workspace model provider selection",
  },
  agentSectionTitle: {
    defaultMessage: "Hyperlocalise Agent",
    id: "IiWzWDOWnD",
    description: "Section heading for Hyperlocalise Agent capability model settings",
  },
  agentSectionDescription: {
    defaultMessage:
      "Ask, Translation, and Coding use the workspace default model today. Per-capability overrides are coming soon.",
    id: "vSisR0WmWz",
    description: "Description under the Hyperlocalise Agent section heading",
  },
  agentAutomationsNote: {
    defaultMessage:
      "Workspace automations currently use the same models as Coding and Translation.",
    id: "+4e8C+B7dz",
    description: "Footnote explaining automation model inheritance on the AI Engine page",
  },
  currentSetupTitle: {
    defaultMessage: "Workspace default",
    id: "hbYZCJv/dT",
    description: "Heading for the workspace default model summary panel",
  },
  currentSetupDescription: {
    defaultMessage:
      "Hyperlocalise Agent capabilities inherit this provider and model until customized per capability.",
    id: "Dx+sE/p7+P",
    description: "Description for the workspace default model summary panel",
  },
  currentSetupProviderLabel: {
    defaultMessage: "Provider",
    id: "o8nZfgq6Yv",
    description: "Label for the active provider name in the summary panel",
  },
  currentSetupModelLabel: {
    defaultMessage: "Default model",
    id: "XpeTF2YWKH",
    description: "Label for the workspace default model in the summary panel",
  },
  currentSetupApiKeyLabel: {
    defaultMessage: "API key",
    id: "vlpA416ahD",
    description: "Label for the masked API key in the summary panel",
  },
  currentSetupValidatedLabel: {
    defaultMessage: "Last validated",
    id: "WkCXvs44H8",
    description: "Label for the provider credential validation timestamp",
  },
  manageProviderAction: {
    defaultMessage: "Manage provider",
    id: "AFid22/7fj",
    description: "Button to open BYOK provider configuration",
  },
  includedBadge: {
    defaultMessage: "Included",
    id: "KoatxZfPmW",
    description: "Badge for Hyperlocalise-managed inference on the AI Engine page",
  },
  workspaceDefaultBadge: {
    defaultMessage: "Workspace default",
    id: "AR7fkvL1P9",
    description: "Badge showing an agent capability inherits the workspace default model",
  },
  capabilityAskName: {
    defaultMessage: "Ask",
    id: "7JjjDkCqaI",
    description: "Hyperlocalise Agent Ask capability name",
  },
  capabilityAskDescription: {
    defaultMessage:
      "Chat, Slack, and general workspace questions with project and glossary context.",
    id: "XtzSAMs4em",
    description: "Hyperlocalise Agent Ask capability description",
  },
  capabilityTranslationName: {
    defaultMessage: "Translation",
    id: "sk24eCggsw",
    description: "Hyperlocalise Agent Translation capability name",
  },
  capabilityTranslationDescription: {
    defaultMessage:
      "File and string translation jobs, batch localization, and translation subagents.",
    id: "nqV2qZ+dzM",
    description: "Hyperlocalise Agent Translation capability description",
  },
  capabilityCodingName: {
    defaultMessage: "Coding",
    id: "Q8OhM5eaVm",
    description: "Hyperlocalise Agent Coding capability name",
  },
  capabilityCodingDescription: {
    defaultMessage:
      "Repository agent, GitHub automations, patches, and sandboxed code changes for localization fixes.",
    id: "CIjzfipJPL",
    description: "Hyperlocalise Agent Coding capability description",
  },
  noAccess: {
    defaultMessage: "You do not have permission to manage AI providers in this workspace.",
    id: "rpzNVqnjuM",
    description: "Shown when the current role cannot view AI Engine provider settings",
  },
  hyperlocaliseGoLabel: {
    defaultMessage: "Included models",
    id: "MUcqH6QBF5",
    description: "Managed Hyperlocalise model provider name",
  },
  hyperlocaliseGoDescription: {
    defaultMessage: "Managed by Hyperlocalise",
    id: "tHJT8VDfIn",
    description: "Managed Hyperlocalise model provider description",
  },
  openAiLabel: {
    defaultMessage: "Open AI",
    id: "dm/0dsDRmT",
    description: "OpenAI BYOK provider name on the AI Engine page",
  },
  openAiDescription: {
    defaultMessage: "Connect your OpenAI account",
    id: "Hqa87sQvVP",
    description: "OpenAI BYOK provider description on the AI Engine page",
  },
  anthropicLabel: {
    defaultMessage: "Anthropic",
    id: "3G3Ey6WZkU",
    description: "Anthropic BYOK provider name on the AI Engine page",
  },
  anthropicDescription: {
    defaultMessage: "Connect your Anthropic account",
    id: "wlOEitxlRT",
    description: "Anthropic BYOK provider description on the AI Engine page",
  },
  geminiLabel: {
    defaultMessage: "Google Gemini",
    id: "xaeNAP8qpf",
    description: "Google Gemini BYOK provider name on the AI Engine page",
  },
  geminiDescription: {
    defaultMessage: "Connect your Gemini account",
    id: "3sdI+9Dw/K",
    description: "Google Gemini BYOK provider description on the AI Engine page",
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
  includedAlwaysAvailableFooter: {
    defaultMessage: "Always available",
    id: "49VwGXQnqx",
    description: "Footer label on Included model provider card",
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
      "Save a shared provider key for this workspace. Saving validates the key and encrypts it at rest.",
    id: "njR/Tp8zi7",
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
    id: "JOyIQ9rRB7",
    description: "Button label while disconnecting an AI Engine provider",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "Dt8QOAfnsv",
    description: "Button label to disconnect an AI Engine provider",
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
});
