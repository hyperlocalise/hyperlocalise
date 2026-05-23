import type { ExternalTmsTranslationMemoryMatcher } from "@/lib/providers/provider-translation-memory-matchers";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/translation/translation-memory-match";

import {
  buildLokaliseProjectTranslationMemoryExternalId,
  buildLokaliseTranslationMemorySegmentCandidates,
} from "./normalize-lokalise-context-matches";
import { LokaliseApiClient, LokaliseApiError, LOKALISE_TM_SYNC_MAX_KEYS } from "./lokalise-api";

export const searchLokaliseTranslationMemoryMatches: ExternalTmsTranslationMemoryMatcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  memory,
  sourceLocale,
  targetLocale,
  sourceText,
  limit,
}) => {
  const projectId = externalProjectId.trim();
  if (!projectId) {
    return [];
  }

  const expectedExternalMemoryId = buildLokaliseProjectTranslationMemoryExternalId(projectId);
  if (memory.externalMemoryId && memory.externalMemoryId !== expectedExternalMemoryId) {
    return [];
  }

  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl,
  });

  let allKeys;
  try {
    allKeys = await client.listKeys(projectId, { includeTranslations: true });
  } catch (error) {
    if (error instanceof LokaliseApiError && error.status === 401) {
      throw new Error("lokalise_auth_invalid");
    }
    throw error;
  }

  const keys = allKeys.slice(0, LOKALISE_TM_SYNC_MAX_KEYS);
  const candidates = buildLokaliseTranslationMemorySegmentCandidates(keys, {
    sourceLocale,
    targetLocale,
    sourceText,
    limit,
  });

  return candidates.map((candidate, index) =>
    normalizeProviderTranslationMemoryMatch({
      sourceText: candidate.sourceText,
      targetText: candidate.targetText,
      sourceLocale,
      targetLocale,
      matchScore: candidate.matchScore,
      providerKind: "lokalise",
      resourceId: memory.id,
      externalResourceId: expectedExternalMemoryId,
      externalSegmentId: String(candidate.keyId),
      memoryName: memory.name,
      rank: 1 - index * 0.01,
    }),
  );
};

export function memorySupportsLiveSearch(memory: {
  capabilityMode: string | null;
  externalProviderKind: string | null;
}) {
  if (memory.externalProviderKind !== "lokalise") {
    return memory.capabilityMode === "live_search";
  }

  return memory.capabilityMode === "live_search" || memory.capabilityMode === "synced_import";
}
