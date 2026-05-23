import type { ExternalTmsTranslationMemoryMatcher } from "@/lib/providers/provider-translation-memory-matchers";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/translation/translation-memory-match";

import { resolvePhraseTmsProjectUid } from "./phrase-job-context";
import {
  normalizePhraseMatchScore,
  normalizePhraseTranslationMemorySearchMatches,
} from "./normalize-phrase-context-matches";
import { PhraseTmsApiClient, PhraseTmsApiError } from "./phrase-tms-api";

export const searchPhraseTranslationMemoryMatches: ExternalTmsTranslationMemoryMatcher = async ({
  secretMaterial,
  externalProjectId,
  project,
  memory,
  sourceLocale,
  targetLocale,
  sourceText,
  limit,
  externalJobUid,
  credential,
}) => {
  const jobUid = externalJobUid?.trim();
  if (!jobUid || !project) {
    return [];
  }

  const tmsProjectUid = resolvePhraseTmsProjectUid(project, externalProjectId);
  if (!tmsProjectUid) {
    return [];
  }

  const client = new PhraseTmsApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl,
  });

  let results;
  try {
    results = await client.searchJobTranslationMemorySegment({
      projectUid: tmsProjectUid,
      jobUid,
      segment: sourceText,
      maxSegments: Math.min(limit, 5),
    });
  } catch (error) {
    if (error instanceof PhraseTmsApiError && error.status === 401) {
      throw new Error("phrase_auth_invalid");
    }
    return [];
  }

  const externalMemoryId = memory.externalMemoryId;
  const filtered = externalMemoryId
    ? results.filter((result) => result.transMemoryUid === externalMemoryId)
    : results;

  const memoryIdByExternalUid = new Map<string, string>();
  if (externalMemoryId) {
    memoryIdByExternalUid.set(externalMemoryId, memory.id);
  }

  const normalized = normalizePhraseTranslationMemorySearchMatches(filtered, {
    targetLocale,
    memoryIdByExternalUid,
  });

  return normalized.slice(0, limit).map((match, index) =>
    normalizeProviderTranslationMemoryMatch({
      sourceText: match.sourceText,
      targetText: match.targetText,
      sourceLocale,
      targetLocale,
      matchScore: normalizePhraseMatchScore(match.matchScore),
      providerKind: "phrase",
      resourceId: memory.id,
      externalResourceId: match.externalResourceId,
      externalSegmentId: match.id,
      memoryName: memory.name,
      rank: 1 - index * 0.01,
    }),
  );
};
