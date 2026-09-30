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
import type { LlmProvider } from "@/lib/database/types";
import { llmProviderContentEditoralog } from "@/lib/providers/shared/catalog";
import { curatedOpenAiNativeModels } from "@/lib/providers/shared/vercel-ai-gateway-openai-models";

/** BYOK providers surfaced on the marketing pricing page. */
export const pricingByokProviderIds = ["openai", "anthropic", "gemini"] as const satisfies readonly LlmProvider[];

export type PricingByokProviderId = (typeof pricingByokProviderIds)[number];

/** Managed agent LLM ids on Vercel AI Gateway (draws down monthly AI credit). */
export const pricingManagedAgentGatewayModelIds = curatedOpenAiNativeModels.map(
  (slug) => `openai/${slug}`,
);

export function getPricingByokProviderModelIds(provider: PricingByokProviderId): readonly string[] {
  return llmProviderContentEditoralog[provider].models;
}
