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
    defaultMessage: "Choose the model provider agents use in this workspace.",
    id: "vd5foq/6mc",
    description: "AI Engine page description",
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
