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
import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model-id";

export const sandboxOpenAiApiKeyEnv = "OPENAI_API_KEY";
export const sandboxAiGatewayApiKeyEnv = "AI_GATEWAY_API_KEY";
export const sandboxAiGatewayBaseUrlEnv = "AI_GATEWAY_BASE_URL";

export const sandboxByokProviders = ["openai", "anthropic", "gemini", "groq", "mistral"] as const;

export type SandboxByokProvider = (typeof sandboxByokProviders)[number];
export type SandboxLlmProvider = SandboxByokProvider | "ai_gateway";

export type SandboxTranslationEnvSource = {
  OPENAI_API_KEY?: string | undefined;
  AI_GATEWAY_API_KEY?: string | undefined;
  AI_GATEWAY_BASE_URL?: string | undefined;
};

export type SandboxByokCredential = {
  provider: SandboxByokProvider;
  apiKey: string;
  model: string;
};

export type SandboxLlmProfile = {
  provider: SandboxLlmProvider;
  model: string;
};

export const sandboxApiKeyEnvByByokProvider = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
} as const satisfies Record<SandboxByokProvider, string>;

function readEnvValue(source: object, key: keyof SandboxTranslationEnvSource): string | undefined {
  const value = (source as SandboxTranslationEnvSource)[key];
  return typeof value === "string" ? value : undefined;
}

function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveSandboxLlmProfile(
  source: object,
  byok?: SandboxByokCredential | null,
): SandboxLlmProfile {
  if (byok) {
    return {
      provider: byok.provider,
      model: byok.model,
    };
  }

  if (trimEnvValue(readEnvValue(source, "AI_GATEWAY_API_KEY"))) {
    return {
      provider: "ai_gateway",
      model: `openai/${hyperlocaliseAgentModelId}`,
    };
  }

  return {
    provider: "openai",
    model: hyperlocaliseAgentModelId,
  };
}

export function resolveSandboxTranslationEnv(
  source: object,
  byok?: SandboxByokCredential | null,
): Record<string, string> {
  if (byok) {
    const apiKey = trimEnvValue(byok.apiKey);
    if (!apiKey) {
      throw new Error("organization provider credential is incomplete");
    }

    return {
      [sandboxApiKeyEnvByByokProvider[byok.provider]]: apiKey,
    };
  }

  const openaiApiKey = trimEnvValue(readEnvValue(source, "OPENAI_API_KEY"));
  const aiGatewayApiKey = trimEnvValue(readEnvValue(source, "AI_GATEWAY_API_KEY"));
  const aiGatewayBaseUrl = trimEnvValue(readEnvValue(source, "AI_GATEWAY_BASE_URL"));

  if (!openaiApiKey && !aiGatewayApiKey) {
    throw new Error("OPENAI_API_KEY or AI_GATEWAY_API_KEY is not configured");
  }

  return {
    ...(openaiApiKey ? { [sandboxOpenAiApiKeyEnv]: openaiApiKey } : {}),
    ...(aiGatewayApiKey ? { [sandboxAiGatewayApiKeyEnv]: aiGatewayApiKey } : {}),
    ...(aiGatewayBaseUrl ? { [sandboxAiGatewayBaseUrlEnv]: aiGatewayBaseUrl } : {}),
  };
}
