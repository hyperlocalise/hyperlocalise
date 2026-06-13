import { z } from "zod";

import type { LlmProvider } from "@/lib/database/types";

export const curatedLlmProviders = [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
] as const satisfies readonly LlmProvider[];

export const llmProviderSchema = z.enum(curatedLlmProviders);

export const llmProviderCatalog = {
  openai: {
    label: "OpenAI",
    models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"],
  },
  anthropic: {
    label: "Anthropic",
    models: [
      "claude-sonnet-4-6",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
      "claude-opus-4-5",
    ],
  },
  gemini: {
    label: "Gemini",
    models: [
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
      "gemini-3-flash",
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ],
  },
  groq: {
    label: "Groq",
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"],
  },
  mistral: {
    label: "Mistral",
    models: ["mistral-small-latest", "mistral-large-latest"],
  },
} as const satisfies Record<LlmProvider, { label: string; models: readonly string[] }>;

export const defaultModelByProvider = Object.fromEntries(
  Object.entries(llmProviderCatalog).map(([provider, config]) => [provider, config.models[0]]),
) as Record<LlmProvider, string>;

export function isSupportedModelForProvider(provider: LlmProvider, model: string) {
  return (llmProviderCatalog[provider].models as readonly string[]).includes(model);
}
