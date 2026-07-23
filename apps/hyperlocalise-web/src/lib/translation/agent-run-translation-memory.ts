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
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import type {
  AgentRunTranslationMemoryMatchUsage,
  TranslationMemoryMatchSource,
} from "@/lib/translation/translation-memory-match";

export type AgentRunTranslationMemoryUsageEntry = {
  externalStringId: string;
  key: string;
  matches: AgentRunTranslationMemoryMatchUsage[];
};

function isMatchUsage(value: unknown): value is AgentRunTranslationMemoryMatchUsage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const match = value as AgentRunTranslationMemoryMatchUsage;
  return (
    typeof match.memoryId === "string" &&
    typeof match.memoryName === "string" &&
    typeof match.targetLocale === "string" &&
    (match.matchSource === "synced_database" || match.matchSource === "live_provider")
  );
}

function isUsageEntry(value: unknown): value is AgentRunTranslationMemoryUsageEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as AgentRunTranslationMemoryUsageEntry;
  return (
    typeof entry.externalStringId === "string" &&
    typeof entry.key === "string" &&
    Array.isArray(entry.matches) &&
    entry.matches.every(isMatchUsage)
  );
}

export function parseTranslationMemoryUsageFromOutputSummary(
  outputSummary: Record<string, unknown> | undefined,
): AgentRunTranslationMemoryUsageEntry[] | null {
  if (!outputSummary || !Array.isArray(outputSummary.translationMemoryUsage)) {
    return null;
  }

  const entries = outputSummary.translationMemoryUsage.filter(isUsageEntry);
  return entries.length > 0 ? entries : null;
}

export function countTranslationMemoryMatchesInUsage(
  usage: AgentRunTranslationMemoryUsageEntry[] | null,
) {
  if (!usage) {
    return 0;
  }

  return usage.reduce((total, entry) => total + entry.matches.length, 0);
}

export function formatTranslationMemoryMatchSourceLabel(input: {
  matchSource: TranslationMemoryMatchSource;
  providerKind: ExternalTmsProviderKind | null;
}) {
  if (input.matchSource === "synced_database") {
    return "Synced database";
  }

  if (input.providerKind) {
    return `Live ${input.providerKind}`;
  }

  return "Live provider";
}

export function formatTranslationMemoryResourceLabel(match: AgentRunTranslationMemoryMatchUsage) {
  const source = formatTranslationMemoryMatchSourceLabel(match);
  const resource =
    match.externalResourceId && match.externalResourceId !== match.resourceId
      ? ` · TM ${match.externalResourceId}`
      : "";

  return `${source}${resource}`;
}
