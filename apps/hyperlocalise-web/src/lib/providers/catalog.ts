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
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
  },
  anthropic: {
    label: "Anthropic",
    models: ["claude-3-5-haiku-20241022", "claude-3-7-sonnet-20250219"],
  },
  gemini: {
    label: "Gemini",
    models: ["gemini-2.0-flash", "gemini-2.5-flash-preview-04-17"],
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
