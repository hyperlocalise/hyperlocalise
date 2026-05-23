import type { ExternalTmsTranslationMemoryFetcher } from "@/lib/providers/external-tms-tm-sync";

import { resolveSmartlingAccountUid, uniqueLocales } from "./smartling-account-context";
import {
  SmartlingApiClient,
  SmartlingApiError,
  SMARTLING_TM_SYNC_MAX_ENTRIES,
  uniqueSmartlingLocales,
} from "./smartling-api";

export const fetchSmartlingTranslationMemories: ExternalTmsTranslationMemoryFetcher = async ({
  secretMaterial,
  externalProjectId,
  project,
}) => {
  const accountUid = await resolveSmartlingAccountUid({
    secretMaterial,
    externalProjectId,
    project,
  });
  if (!accountUid) {
    throw new Error("smartling_account_uid_required");
  }

  const client = new SmartlingApiClient({ credentials: secretMaterial });

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

  const results = await Promise.all(
    memories
      .filter((memory) => memory.translationMemoryUid)
      .map(async (memory) => {
        const memorySourceLocale = memory.sourceLocaleId || sourceLocale;
        const entryTargetLocales = uniqueSmartlingLocales([
          ...targetLocales,
          ...memory.localeIds.filter((locale) => locale !== memorySourceLocale),
        ]);

        try {
          const buildEntries = (
            segments: Awaited<ReturnType<SmartlingApiClient["listTranslationMemoryEntries"]>>,
          ) =>
            buildTranslationMemoryEntries({
              translationMemoryUid: memory.translationMemoryUid,
              sourceLanguageId: memorySourceLocale,
              targetLocales: entryTargetLocales,
              segments,
            });

          const segments = await client.listTranslationMemoryEntries(
            accountUid,
            memory.translationMemoryUid,
            {
              sourceLocaleId: memorySourceLocale,
              targetLocaleIds: entryTargetLocales,
              shouldStop: (fetchedSegments) =>
                buildEntries(fetchedSegments).length >= SMARTLING_TM_SYNC_MAX_ENTRIES,
            },
          );
          const syncedEntries = buildEntries(segments).slice(0, SMARTLING_TM_SYNC_MAX_ENTRIES);

          return {
            externalMemoryId: memory.translationMemoryUid,
            name: memory.name,
            description: memory.description ?? "",
            sourceLocale: memorySourceLocale,
            localeCoverage: uniqueSmartlingLocales([memorySourceLocale, ...memory.localeIds]),
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
            localeCoverage: uniqueSmartlingLocales([memorySourceLocale, ...memory.localeIds]),
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
      }),
  );

  return results;
};

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
