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

export type SandboxLlmProvider = "ai_gateway" | "openai";

export type SandboxTranslationEnvSource = {
  OPENAI_API_KEY?: string;
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_BASE_URL?: string;
};

export type SandboxLlmProfile = {
  provider: SandboxLlmProvider;
  model: string;
};

function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveSandboxLlmProfile(
  source: SandboxTranslationEnvSource,
): SandboxLlmProfile {
  if (trimEnvValue(source.AI_GATEWAY_API_KEY)) {
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
  source: SandboxTranslationEnvSource,
): Record<string, string> {
  const openaiApiKey = trimEnvValue(source.OPENAI_API_KEY);
  const aiGatewayApiKey = trimEnvValue(source.AI_GATEWAY_API_KEY);
  const aiGatewayBaseUrl = trimEnvValue(source.AI_GATEWAY_BASE_URL);

  if (!openaiApiKey && !aiGatewayApiKey) {
    throw new Error("OPENAI_API_KEY or AI_GATEWAY_API_KEY is not configured");
  }

  return {
    ...(openaiApiKey ? { [sandboxOpenAiApiKeyEnv]: openaiApiKey } : {}),
    ...(aiGatewayApiKey ? { [sandboxAiGatewayApiKeyEnv]: aiGatewayApiKey } : {}),
    ...(aiGatewayBaseUrl ? { [sandboxAiGatewayBaseUrlEnv]: aiGatewayBaseUrl } : {}),
  };
}
