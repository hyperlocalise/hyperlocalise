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
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model-id";
import type { LlmProvider } from "@/lib/database/types";

export const hyperlocaliseManagedGatewayModelId = `openai/${hyperlocaliseAgentModelId}`;
export const hyperlocaliseImageModelId = "openai/gpt-image-2";
export const hyperlocaliseVideoModelId = "google/gemini-omni-flash-preview";

export type AgentLanguageModelSource = LlmProvider | "gateway";

export type ResolvedAgentLanguageModel = {
  model: LanguageModel;
  source: AgentLanguageModelSource;
  modelId: string;
};

const openAiCompatibleBaseUrlByProvider = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
} as const satisfies Partial<Record<LlmProvider, string>>;

export function getManagedLanguageModel(): LanguageModel {
  return hyperlocaliseManagedGatewayModelId;
}

export function getManagedImageModel() {
  return hyperlocaliseImageModelId;
}

export function getManagedVideoModel() {
  return hyperlocaliseVideoModelId;
}

export function resolveProviderLanguageModel(input: {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}): LanguageModel {
  switch (input.provider) {
    case "anthropic": {
      const provider = createAnthropic({ apiKey: input.apiKey });
      return provider(input.model);
    }
    case "openai": {
      const provider = createOpenAI({ apiKey: input.apiKey });
      return provider(input.model);
    }
    case "gemini":
    case "groq":
    case "mistral": {
      const baseURL = openAiCompatibleBaseUrlByProvider[input.provider];
      const provider = createOpenAI({
        apiKey: input.apiKey,
        ...(baseURL ? { baseURL } : {}),
      });
      return provider(input.model);
    }
  }
}

export function getAgentProviderOptions(source: AgentLanguageModelSource) {
  if (source === "openai" || source === "gateway") {
    return {
      openai: {
        reasoningSummary: "auto" as const,
      },
    };
  }

  return undefined;
}
