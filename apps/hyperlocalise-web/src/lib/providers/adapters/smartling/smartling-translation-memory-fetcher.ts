import type { ExternalTmsTranslationMemoryFetcher } from "@/lib/providers/tms-provider-types";

import { resolveSmartlingAccountUid, uniqueLocales } from "./smartling-account-context";
import {
  SmartlingApiClient,
  SmartlingApiError,
  SMARTLING_TM_SYNC_MAX_ENTRIES,
} from "./smartling-api";

const TRANSLATION_MEMORY_FETCH_CONCURRENCY = 5;

export const fetchSmartlingTranslationMemories: ExternalTmsTranslationMemoryFetcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  project,
}) => {
  const authBaseUrl = credential.baseUrl ?? undefined;
  const accountUid = await resolveSmartlingAccountUid({
    secretMaterial,
    externalProjectId,
    project,
    authBaseUrl,
  });
  if (!accountUid) {
    throw new Error("smartling_account_uid_required");
  }

  const client = new SmartlingApiClient({ credentials: secretMaterial, authBaseUrl });

  let memories;
  try {
    memories = await client.listAccountTranslationMemories(accountUid);
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 401) {
      throw new Error("smartling_auth_invalid");
    }
    throw error;
  }

  const sourceLocale = project.sourceLocale ?? "en";
  const targetLocales = uniqueLocales(project.targetLocales ?? []);

  const results = await mapInBatches(
    memories.filter((memory) => memory.translationMemoryUid),
    TRANSLATION_MEMORY_FETCH_CONCURRENCY,
    async (memory) => {
      const memorySourceLocale = memory.sourceLocaleId || sourceLocale;
      const entryTargetLocales = uniqueLocales([
        ...targetLocales,
        ...memory.localeIds.filter((locale) => locale !== memorySourceLocale),
      ]);

      try {
        let syncedEntryCount = 0;
        const segments = await client.listTranslationMemoryEntries(
          accountUid,
          memory.translationMemoryUid,
          {
            sourceLocaleId: memorySourceLocale,
            targetLocaleIds: entryTargetLocales,
            shouldStop: (page) => {
              syncedEntryCount += countTranslationMemoryEntries({
                segments: page,
                targetLocales: entryTargetLocales,
              });
              return syncedEntryCount >= SMARTLING_TM_SYNC_MAX_ENTRIES;
            },
          },
        );
        const syncedEntries = buildTranslationMemoryEntries({
          translationMemoryUid: memory.translationMemoryUid,
          sourceLanguageId: memorySourceLocale,
          targetLocales: entryTargetLocales,
          segments,
        }).slice(0, SMARTLING_TM_SYNC_MAX_ENTRIES);

        return {
          externalMemoryId: memory.translationMemoryUid,
          name: memory.name,
          description: memory.description ?? "",
          sourceLocale: memorySourceLocale,
          localeCoverage: uniqueLocales([memorySourceLocale, ...memory.localeIds]),
          segmentCount: syncedEntries.length,
          metadata: {
            smartlingTranslationMemoryUid: memory.translationMemoryUid,
            smartlingAccountUid: accountUid,
            importedSegmentCount: syncedEntries.length,
          },
          entries: syncedEntries,
        };
      } catch (error) {
        if (error instanceof SmartlingApiError && error.status === 401) {
          throw new Error("smartling_auth_invalid");
        }

        return {
          externalMemoryId: memory.translationMemoryUid,
          name: memory.name,
          description: memory.description ?? "",
          sourceLocale: memorySourceLocale,
          localeCoverage: uniqueLocales([memorySourceLocale, ...memory.localeIds]),
          segmentCount: null,
          syncErrorMessage:
            error instanceof Error ? error.message : "translation_memory_sync_failed",
          metadata: {
            smartlingTranslationMemoryUid: memory.translationMemoryUid,
            smartlingAccountUid: accountUid,
          },
          entries: [],
        };
      }
    },
  );

  return results;
};

async function mapInBatches<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const batchSize = Math.max(1, concurrency);

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((item) => mapper(item)));
    results.push(...batchResults);
  }

  return results;
}

function countTranslationMemoryEntries(input: {
  targetLocales: string[];
  segments: Array<{
    sourceText: string;
    translations: Array<{ targetLocaleId: string; translationText: string }>;
  }>;
}) {
  let count = 0;

  for (const segment of input.segments) {
    const sourceText = segment.sourceText.trim();
    if (!sourceText) {
      continue;
    }

    for (const targetLocale of input.targetLocales) {
      const targetTranslation = segment.translations.find(
        (translation) =>
          translation.targetLocaleId === targetLocale && translation.translationText.trim(),
      );
      if (targetTranslation) {
        count += 1;
      }
    }
  }

  return count;
}

function buildTranslationMemoryEntries(input: {
  translationMemoryUid: string;
  sourceLanguageId: string;
  targetLocales: string[];
  segments: Array<{
    entryUid: string;
    sourceText: string;
    sourceLocaleId: string;
    translations: Array<{ targetLocaleId: string; translationText: string }>;
  }>;
}) {
  const entries: Array<{
    externalKey: string;
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    targetText: string;
    matchScore: number;
    metadata: Record<string, unknown>;
  }> = [];

  for (const segment of input.segments) {
    const sourceText = segment.sourceText.trim();
    if (!sourceText) {
      continue;
    }

    for (const targetLocale of input.targetLocales) {
      const targetTranslation = segment.translations.find(
        (translation) =>
          translation.targetLocaleId === targetLocale && translation.translationText.trim(),
      );
      if (!targetTranslation) {
        continue;
      }

      entries.push({
        externalKey: `${input.translationMemoryUid}:${segment.entryUid}:${targetLocale}`,
        sourceLocale: input.sourceLanguageId,
        targetLocale,
        sourceText,
        targetText: targetTranslation.translationText.trim(),
        matchScore: 100,
        metadata: {
          smartlingEntryUid: segment.entryUid,
        },
      });
    }
  }

  return entries;
}
