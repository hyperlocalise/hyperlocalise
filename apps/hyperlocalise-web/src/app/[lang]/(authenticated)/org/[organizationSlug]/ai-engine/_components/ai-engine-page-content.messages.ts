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
    id: "wP3kR8tY1n",
    description: "AI Engine page heading",
  },
  pageDescription: {
    defaultMessage: "Choose the model provider agents use in this workspace.",
    id: "bH6sD2qL9f",
    description: "AI Engine page description",
  },
  workspaceLevelBadge: {
    defaultMessage: "Workspace level",
    id: "cK5nM1vE4a",
    description: "Badge indicating AI Engine settings apply to the whole workspace",
  },
  noAccess: {
    defaultMessage: "You do not have permission to manage AI providers in this workspace.",
    id: "tJ9pX4wQ7m",
    description: "Shown when the current role cannot view AI Engine provider settings",
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
    description: "OpenAI BYOK provider name on the AI Engine page",
  },
  openAiDescription: {
    defaultMessage: "Connect your OpenAI account",
    id: "QmXtxyLvCd",
    description: "OpenAI BYOK provider description on the AI Engine page",
  },
  anthropicLabel: {
    defaultMessage: "Anthropic",
    id: "1VNZg9UkcM",
    description: "Anthropic BYOK provider name on the AI Engine page",
  },
  anthropicDescription: {
    defaultMessage: "Connect your Anthropic account",
    id: "4tP9x2ODN4",
    description: "Anthropic BYOK provider description on the AI Engine page",
  },
  geminiLabel: {
    defaultMessage: "Google Gemini",
    id: "l0d6YXPPZ9",
    description: "Google Gemini BYOK provider name on the AI Engine page",
  },
  geminiDescription: {
    defaultMessage: "Connect your Gemini account",
    id: "R+hZLscXuo",
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
    id: "gF2sN8pK4w",
    description: "Button label while disconnecting an AI Engine provider",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "hD7cR1tL6y",
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
