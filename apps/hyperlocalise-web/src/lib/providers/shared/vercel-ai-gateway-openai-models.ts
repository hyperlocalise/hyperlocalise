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

/** OpenAI model slugs on Vercel AI Gateway that expose a `-fast` variant. */
const openAiGatewayFastVariantSlugs = new Set([
  "gpt-6.1-sol",
  "gpt-6-luna",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
]);

const curatedOpenAiNativeModelSlugs = [
  "gpt-6.1-sol",
  "gpt-6-luna",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.4-pro",
] as const;

const workspaceAutomationOpenAiNativeModelSlugs = [
  "gpt-6.1-sol",
  "gpt-6-luna",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
] as const;

function expandOpenAiNativeSlugsWithFastVariants(slugs: readonly string[]): readonly string[] {
  const expanded: string[] = [];
  for (const slug of slugs) {
    expanded.push(slug);
    if (openAiGatewayFastVariantSlugs.has(slug)) {
      expanded.push(`${slug}-fast`);
    }
  }
  return expanded;
}

/** Native OpenAI model ids for BYOK validation (no `openai/` prefix). */
export const curatedOpenAiNativeModels = expandOpenAiNativeSlugsWithFastVariants(
  curatedOpenAiNativeModelSlugs,
);

/** OpenAI gateway model ids selectable for workspace automations. */
export const OPENAI_WORKSPACE_AUTOMATION_GATEWAY_MODELS = [
  "openai/gpt-6.1-sol",
  "openai/gpt-6.1-sol-fast",
  "openai/gpt-6-luna",
  "openai/gpt-6-luna-fast",
  "openai/gpt-6-astra",
  "openai/gpt-6-astra-fast",
  "openai/gpt-6-sol",
  "openai/gpt-6-sol-fast",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-terra-fast",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-sol-fast",
] as const;

export function buildOpenAiWorkspaceAutomationGatewayModelsForTest(): readonly string[] {
  return expandOpenAiNativeSlugsWithFastVariants(workspaceAutomationOpenAiNativeModelSlugs).map(
    (slug) => `openai/${slug}`,
  );
}

export function buildCuratedOpenAiNativeModelsForTest(): readonly string[] {
  return expandOpenAiNativeSlugsWithFastVariants(curatedOpenAiNativeModelSlugs);
}
