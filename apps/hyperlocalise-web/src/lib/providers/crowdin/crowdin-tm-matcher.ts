import type { ExternalTmsTranslationMemoryMatcher } from "@/lib/providers/provider-translation-memory-matchers";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/translation/translation-memory-match";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";

export const searchCrowdinTranslationMemoryMatches: ExternalTmsTranslationMemoryMatcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  memory,
  sourceLocale,
  targetLocale,
  sourceText,
  limit,
}) => {
  const projectId = Number(externalProjectId);
  if (Number.isNaN(projectId)) {
    return [];
  }

  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  let results: Awaited<ReturnType<CrowdinApiClient["concordanceSearch"]>>;
  try {
    results = await client.concordanceSearch(projectId, {
      sourceLanguageId: sourceLocale,
      targetLanguageId: targetLocale,
      expressions: [sourceText],
      minRelevant: 50,
      autoSubstitution: false,
    });
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const externalMemoryId = memory.externalMemoryId ? Number(memory.externalMemoryId) : null;

  return results
    .filter((result) => externalMemoryId === null || result.tm.id === externalMemoryId)
    .slice(0, limit)
    .map((result, index) =>
      normalizeProviderTranslationMemoryMatch({
        sourceText: result.source,
        targetText: result.target,
        sourceLocale,
        targetLocale,
        matchScore: result.relevant,
        providerKind: "crowdin",
        resourceId: memory.id,
        externalResourceId: String(result.tm.id),
        externalSegmentId: String(result.recordId),
        memoryName: memory.name,
        rank: 1 - index * 0.01,
      }),
    );
};
