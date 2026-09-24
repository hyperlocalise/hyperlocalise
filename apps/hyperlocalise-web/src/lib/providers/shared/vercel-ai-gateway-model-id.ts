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

const anthropicNativeVersionedModelPattern = /^claude-([a-z0-9-]+)-(\d+)-(\d+)$/i;
const anthropicNativeSingleVersionModelPattern = /^claude-([a-z0-9-]+)-(\d+)$/i;

const gatewayProviderPrefixByLlmProvider = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  groq: "groq",
  mistral: "mistral",
} as const satisfies Record<LlmProvider, string>;

function normalizeAnthropicNativeModelId(model: string): string {
  const versioned = anthropicNativeVersionedModelPattern.exec(model);
  if (versioned) {
    const [, family, major, minor] = versioned;
    return `claude-${family}-${major}.${minor}`;
  }

  const singleVersion = anthropicNativeSingleVersionModelPattern.exec(model);
  if (singleVersion) {
    return model;
  }

  return model;
}

/** Normalize a Vercel AI Gateway model id to the provider catalog form (slashes + Anthropic dots). */
export function normalizeVercelAiGatewayModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed.includes("/")) {
    return trimmed;
  }

  const separatorIndex = trimmed.indexOf("/");
  const provider = trimmed.slice(0, separatorIndex);
  const model = trimmed.slice(separatorIndex + 1);

  if (provider === "anthropic") {
    return `${provider}/${normalizeAnthropicNativeModelId(model)}`;
  }

  return trimmed;
}

/** Map a BYOK provider + native model id to the Vercel AI Gateway billing/runtime id. */
export function toVercelAiGatewayModelId(input: { provider: LlmProvider; model: string }): string {
  const model = input.model.trim();
  if (!model) {
    return model;
  }

  if (model.includes("/")) {
    return normalizeVercelAiGatewayModelId(model);
  }

  const gatewayProvider = gatewayProviderPrefixByLlmProvider[input.provider];
  if (input.provider === "anthropic") {
    return `${gatewayProvider}/${normalizeAnthropicNativeModelId(model)}`;
  }

  return `${gatewayProvider}/${model}`;
}

/** Match a stored or legacy gateway model id to one of the allowed ids (exact after normalization). */
export function matchVercelAiGatewayModelId<T extends string>(
  modelId: string,
  allowedModelIds: readonly T[],
): T | null {
  const normalized = normalizeVercelAiGatewayModelId(modelId);

  for (const allowedModelId of allowedModelIds) {
    if (normalizeVercelAiGatewayModelId(allowedModelId) === normalized) {
      return allowedModelId;
    }
  }

  return null;
}
