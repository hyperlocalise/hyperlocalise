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

import {
  PRICING_IRIS_MODELS,
  type PricingIrisCopyGroup,
  type PricingIrisJob,
  type PricingIrisVendorId,
} from "./pricing-iris-models";
import {
  getPricingByokProviderModelIds,
  pricingManagedAgentGatewayModelIds,
  type PricingByokProviderId,
} from "./pricing-supported-models";

export type PricingModelJob = "write" | PricingIrisJob;

export type PricingModelAccess = "included" | "byok";

export type PricingModelProviderId = "openai" | "anthropic" | "gemini" | PricingIrisVendorId;

/** Where a team picks the model: AI Engine for writers, Iris for creative work. */
export type PricingModelSurface = "ai-engine" | "iris";

/** Shared plain-language copy for writing models. Many rows point at the same key. */
export type PricingWriterCopyKey =
  | "luna"
  | "luna-fast"
  | "openai-writer"
  | "openai-fast"
  | "sonnet"
  | "opus"
  | "haiku"
  | "gemini-flash"
  | "gemini-pro";

export type PricingModelCopy =
  | { kind: "writer"; key: PricingWriterCopyKey }
  | { kind: "iris"; group: PricingIrisCopyGroup };

export type PricingCatalogEntry = {
  modelId: string;
  name: string;
  providerId: PricingModelProviderId;
  job: PricingModelJob;
  access: PricingModelAccess;
  surface: PricingModelSurface;
  copy: PricingModelCopy;
  recommended: boolean;
  /** Workspace default writer. */
  highlight: boolean;
};

const NAME_WORDS: Record<string, string> = {
  gpt: "GPT",
  claude: "Claude",
  gemini: "Gemini",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  flash: "Flash",
  lite: "Lite",
  pro: "Pro",
  mini: "Mini",
  nano: "Nano",
  preview: "Preview",
  luna: "Luna",
  astra: "Astra",
  sol: "Sol",
  terra: "Terra",
};

const managedDefaultModelId = `openai/${hyperlocaliseAgentModelId}`;

/** Models a localization manager should see before the long tail, in display order. */
export const pricingRecommendedModelIds = [
  managedDefaultModelId,
  "claude-sonnet-5",
  "nano-banana-2.1",
  "gpt-image-2.6-sunburst",
  "image-localise",
  "veo-3.1",
  "kling-3-pro",
  "seedance-2.5",
  "sync-lipsync-2",
  "elevenlabs-v4",
  "elevenlabs-dubbing",
  "elevenlabs-music",
  "universal-3.5-pro",
] as const;

const recommendedModelIds = new Set<string>(pricingRecommendedModelIds);

/**
 * Turn a gateway or provider slug into a name a non-technical reader can scan.
 * Product names stay in English.
 */
export function formatPricingModelName(modelId: string): string {
  const slug = modelId.split("/").pop() ?? modelId;
  const fast = slug.endsWith("-fast");
  const base = fast ? slug.slice(0, -"-fast".length) : slug;
  const tokens = base.split("-");
  const parts: string[] = [];

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    const next = tokens[index + 1];

    if (/^\d+$/.test(token) && next && /^\d+$/.test(next)) {
      parts.push(`${token}.${next}`);
      index += 2;
      continue;
    }

    if (token === "gpt" && next && /^\d/.test(next)) {
      parts.push(`GPT-${next}`);
      index += 2;
      continue;
    }

    parts.push(NAME_WORDS[token] ?? token);
    index += 1;
  }

  if (fast) {
    parts.push("Fast");
  }

  return parts.join(" ");
}

function writerCopyKey(modelId: string): PricingWriterCopyKey {
  const slug = modelId.split("/").pop() ?? modelId;
  if (slug === "gpt-6-luna") return "luna";
  if (slug === "gpt-6-luna-fast") return "luna-fast";
  if (slug.startsWith("claude-sonnet")) return "sonnet";
  if (slug.startsWith("claude-opus")) return "opus";
  if (slug.startsWith("claude-haiku")) return "haiku";
  if (slug.startsWith("gemini") && slug.includes("flash")) return "gemini-flash";
  if (slug.startsWith("gemini")) return "gemini-pro";
  if (slug.endsWith("-fast")) return "openai-fast";
  return "openai-writer";
}

function writerEntry(
  modelId: string,
  providerId: PricingModelProviderId,
  access: PricingModelAccess,
): PricingCatalogEntry {
  return {
    modelId,
    name: formatPricingModelName(modelId),
    providerId,
    job: "write",
    access,
    surface: "ai-engine",
    copy: { kind: "writer", key: writerCopyKey(modelId) },
    recommended: recommendedModelIds.has(modelId),
    highlight: modelId === managedDefaultModelId,
  };
}

function irisEntries(): PricingCatalogEntry[] {
  return PRICING_IRIS_MODELS.map((model) => ({
    modelId: model.id,
    name: model.name,
    providerId: model.vendor,
    job: model.job,
    access: "included",
    surface: "iris",
    copy: { kind: "iris", group: model.group },
    recommended: recommendedModelIds.has(model.id),
    highlight: false,
  }));
}

function orderCatalog(entries: readonly PricingCatalogEntry[]): PricingCatalogEntry[] {
  const rank = new Map<string, number>(pricingRecommendedModelIds.map((id, index) => [id, index]));
  return entries.toSorted((left, right) => {
    const leftRank = rank.get(left.modelId) ?? pricingRecommendedModelIds.length;
    const rightRank = rank.get(right.modelId) ?? pricingRecommendedModelIds.length;
    return leftRank - rightRank;
  });
}

/** Every model the pricing page is allowed to mention, in display order. */
export function getPricingCatalogEntries(): readonly PricingCatalogEntry[] {
  const writingProviders: readonly PricingByokProviderId[] = ["anthropic", "gemini"];
  const entries = [
    ...pricingManagedAgentGatewayModelIds.map((modelId) =>
      writerEntry(modelId, "openai", "included"),
    ),
    ...irisEntries(),
    ...writingProviders.flatMap((providerId) =>
      getPricingByokProviderModelIds(providerId).map((modelId) =>
        writerEntry(modelId, providerId, "byok"),
      ),
    ),
  ];

  return orderCatalog(entries);
}
