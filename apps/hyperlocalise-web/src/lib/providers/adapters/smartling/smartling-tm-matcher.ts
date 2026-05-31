import type { ExternalTmsTranslationMemoryMatcher } from "@/lib/providers/contracts/translation-memory-matcher";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";

import { resolveSmartlingAccountUid } from "./smartling-account-context";
import { buildSmartlingTranslationMemoryCandidates } from "./normalize-smartling-context-matches";
import {
  SmartlingApiClient,
  SmartlingApiError,
  SMARTLING_TM_SYNC_MAX_ENTRIES,
} from "./smartling-api";

export const searchSmartlingTranslationMemoryMatches: ExternalTmsTranslationMemoryMatcher = async ({
  secretMaterial,
  externalProjectId,
  project,
  memory,
  sourceLocale,
  targetLocale,
  sourceText,
  limit,
}) => {
  const externalMemoryId = memory.externalMemoryId?.trim();
  if (!externalMemoryId) {
    return [];
  }

  const accountUid = await resolveSmartlingAccountUid({
    secretMaterial,
    externalProjectId,
    project: project ?? undefined,
  });
  if (!accountUid) {
    return [];
  }

  const client = new SmartlingApiClient({ credentials: secretMaterial });

  let entries;
  try {
    let fetchedSegmentCount = 0;

    entries = await client.listTranslationMemoryEntries(accountUid, externalMemoryId, {
      sourceLocaleId: sourceLocale,
      targetLocaleIds: [targetLocale],
      shouldStop: (page) => {
        fetchedSegmentCount += page.length;
        return fetchedSegmentCount >= SMARTLING_TM_SYNC_MAX_ENTRIES;
      },
    });
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 401) {
      throw new Error("smartling_auth_invalid");
    }
    return [];
  }

  const candidates = buildSmartlingTranslationMemoryCandidates(entries, {
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
      providerKind: "smartling",
      resourceId: memory.id,
      externalResourceId: externalMemoryId,
      externalSegmentId: candidate.entryUid,
      memoryName: memory.name,
      rank: Math.max(0, 1 - index * 0.01),
    }),
  );
};
