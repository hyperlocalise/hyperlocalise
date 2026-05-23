import type { ExternalTmsTranslationMemoryFetcher } from "@/lib/providers/external-tms-tm-sync";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";
import { isCrowdinResourceLinkedToProject } from "./crowdin-resource-scope";

const maxSegmentsPerMemory = 2_000;

export const fetchCrowdinTranslationMemories: ExternalTmsTranslationMemoryFetcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  project,
}) => {
  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  const crowdinProjectId = Number(externalProjectId);
  if (!Number.isFinite(crowdinProjectId)) {
    throw new Error("invalid_crowdin_project_id");
  }

  let memories;
  try {
    memories = await client.listTranslationMemories();
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const sourceLocale = project.sourceLocale ?? "en";
  const targetLocales = project.targetLocales ?? [];

  const scoped = memories.filter((memory) =>
    isCrowdinResourceLinkedToProject({
      projectId: crowdinProjectId,
      projectIds: memory.projectIds,
      defaultProjectIds: memory.defaultProjectIds,
    }),
  );

  const results = await Promise.all(
    scoped.map(async (memory) => {
      try {
        const entryTargetLocales = uniqueLocales([
          ...targetLocales,
          ...memory.languageIds.filter((locale) => locale !== memory.languageId),
        ]);
        const sourceLanguageId = memory.languageId || sourceLocale;
        let fetchedSegmentCount = 0;
        const entries: ReturnType<typeof buildTranslationMemoryEntries> = [];
        await client.listTranslationMemorySegments(memory.id, {
          shouldStop: (fetchedSegments) => {
            const newSegments = fetchedSegments.slice(fetchedSegmentCount);
            fetchedSegmentCount = fetchedSegments.length;
            entries.push(
              ...buildTranslationMemoryEntries({
                memoryId: memory.id,
                sourceLanguageId,
                targetLocales: entryTargetLocales,
                segments: newSegments,
              }),
            );

            return entries.length >= maxSegmentsPerMemory;
          },
        });
        const syncedEntries = entries.slice(0, maxSegmentsPerMemory);

        return {
          externalMemoryId: String(memory.id),
          name: memory.name,
          description: memory.description ?? "",
          sourceLocale: memory.languageId || sourceLocale,
          localeCoverage: uniqueLocales([memory.languageId, ...memory.languageIds]),
          segmentCount: memory.segmentsCount,
          externalUrl: memory.webUrl,
          metadata: {
            crowdinTranslationMemoryId: memory.id,
            crowdinProjectId,
            importedSegmentCount: syncedEntries.length,
          },
          entries: syncedEntries,
        };
      } catch (error) {
        if (error instanceof CrowdinApiError && error.status === 401) {
          throw new Error("crowdin_auth_invalid");
        }

        return {
          externalMemoryId: String(memory.id),
          name: memory.name,
          description: memory.description ?? "",
          sourceLocale: memory.languageId || sourceLocale,
          localeCoverage: uniqueLocales([memory.languageId, ...memory.languageIds]),
          segmentCount: memory.segmentsCount,
          externalUrl: memory.webUrl,
          syncErrorMessage:
            error instanceof Error ? error.message : "translation_memory_sync_failed",
          metadata: {
            crowdinTranslationMemoryId: memory.id,
            crowdinProjectId,
          },
          entries: [],
        };
      }
    }),
  );

  return results;
};

function buildTranslationMemoryEntries(input: {
  memoryId: number;
  sourceLanguageId: string;
  targetLocales: string[];
  segments: Array<{
    id: number;
    records: Array<{ id: number; languageId: string; text: string }>;
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
    const sourceRecord = segment.records.find(
      (record) => record.languageId === input.sourceLanguageId && record.text.trim(),
    );
    if (!sourceRecord) {
      continue;
    }

    for (const targetLocale of input.targetLocales) {
      const targetRecord = segment.records.find(
        (record) => record.languageId === targetLocale && record.text.trim(),
      );
      if (!targetRecord) {
        continue;
      }

      entries.push({
        externalKey: `${input.memoryId}:${segment.id}:${targetLocale}`,
        sourceLocale: input.sourceLanguageId,
        targetLocale,
        sourceText: sourceRecord.text,
        targetText: targetRecord.text,
        matchScore: 100,
        metadata: {
          crowdinSegmentId: segment.id,
          crowdinSourceRecordId: sourceRecord.id,
          crowdinTargetRecordId: targetRecord.id,
        },
      });
    }
  }

  return entries;
}

function uniqueLocales(locales: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const locale of locales) {
    const trimmed = locale.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }

  return unique;
}
