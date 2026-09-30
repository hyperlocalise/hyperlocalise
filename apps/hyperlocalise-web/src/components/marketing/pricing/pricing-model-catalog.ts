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
  hyperlocaliseImageModelId,
  hyperlocaliseTranscribeModelId,
  hyperlocaliseTtsModelId,
  hyperlocaliseVideoModelId,
} from "@/lib/providers/managed-model-ids";

import {
  getPricingByokProviderModelIds,
  pricingManagedAgentGatewayModelIds,
  type PricingByokProviderId,
} from "./pricing-supported-models";

export type PricingModelJob = "write" | "speak" | "listen" | "picture" | "video";

export type PricingModelAccess = "included" | "byok";

export type PricingModelProviderId = "openai" | "anthropic" | "gemini" | "fish" | "bytedance";

/** Shared plain-language copy. Many catalog rows point at the same key. */
export type PricingModelCopyKey =
  | "luna"
  | "luna-fast"
  | "openai-writer"
  | "openai-fast"
  | "sonnet"
  | "opus"
  | "haiku"
  | "gemini-flash"
  | "gemini-pro"
  | "voice"
  | "listen"
  | "picture"
  | "video";

export type PricingCatalogEntry = {
  modelId: string;
  name: string;
  providerId: PricingModelProviderId;
  job: PricingModelJob;
  access: PricingModelAccess;
  copyKey: PricingModelCopyKey;
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

const MEDIA_NAMES: Record<string, string> = {
  [hyperlocaliseTtsModelId]: "Fish Audio",
  [hyperlocaliseTranscribeModelId]: "Gemini transcription",
  [hyperlocaliseImageModelId]: "GPT Image",
  [hyperlocaliseVideoModelId]: "Seedance",
};

/** Models a localization manager should see before the long tail. */
const managedDefaultModelId = `openai/${hyperlocaliseAgentModelId}`;

export const pricingRecommendedModelIds = [
  managedDefaultModelId,
  "openai/gpt-6-luna-fast",
  "openai/gpt-6.1-sol",
  "claude-sonnet-5",
  "claude-opus-5-5",
  "gemini-3.8-flash",
  hyperlocaliseTtsModelId,
  hyperlocaliseTranscribeModelId,
  hyperlocaliseImageModelId,
  hyperlocaliseVideoModelId,
] as const;

const recommendedModelIds = new Set<string>(pricingRecommendedModelIds);

/**
 * Turn a gateway or provider slug into a name a non-technical reader can scan.
 * Product names stay in English.
 */
export function formatPricingModelName(modelId: string): string {
  const mediaName = MEDIA_NAMES[modelId];
  if (mediaName) {
    return mediaName;
  }

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

function copyKeyForModel(modelId: string, job: PricingModelJob): PricingModelCopyKey {
  if (job === "speak") return "voice";
  if (job === "listen") return "listen";
  if (job === "picture") return "picture";
  if (job === "video") return "video";

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

function jobForModel(modelId: string): PricingModelJob {
  if (modelId === hyperlocaliseTtsModelId) return "speak";
  if (modelId === hyperlocaliseTranscribeModelId) return "listen";
  if (modelId === hyperlocaliseImageModelId) return "picture";
  if (modelId === hyperlocaliseVideoModelId) return "video";
  return "write";
}

function entryFor(
  modelId: string,
  providerId: PricingModelProviderId,
  access: PricingModelAccess,
): PricingCatalogEntry {
  const job = jobForModel(modelId);
  return {
    modelId,
    name: formatPricingModelName(modelId),
    providerId,
    job,
    access,
    copyKey: copyKeyForModel(modelId, job),
    recommended: recommendedModelIds.has(modelId),
    highlight: modelId === managedDefaultModelId,
  };
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
    ...pricingManagedAgentGatewayModelIds.map((modelId) => entryFor(modelId, "openai", "included")),
    entryFor(hyperlocaliseTtsModelId, "fish", "included"),
    entryFor(hyperlocaliseTranscribeModelId, "gemini", "included"),
    entryFor(hyperlocaliseImageModelId, "openai", "included"),
    entryFor(hyperlocaliseVideoModelId, "bytedance", "included"),
    ...writingProviders.flatMap((providerId) =>
      getPricingByokProviderModelIds(providerId).map((modelId) =>
        entryFor(modelId, providerId, "byok"),
      ),
    ),
  ];

  return orderCatalog(entries);
}
