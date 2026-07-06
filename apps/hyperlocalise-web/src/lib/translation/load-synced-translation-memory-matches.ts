import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import {
  normalizeSyncedDatabaseTranslationMemoryMatch,
  type NormalizedTranslationMemoryMatch,
} from "@/lib/translation/translation-memory-match";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";
import { buildTranslationMemoryTsQuery } from "@/lib/translation/translation-memory-search-query";

type AttachedMemory = {
  memoryId: string;
  memoryName: string;
  source: (typeof schema.projectSourceEnum.enumValues)[number];
  externalProviderKind: ExternalTmsProviderKind | null;
  externalMemoryId: string | null;
};

async function loadAttachedMemories(projectId: string): Promise<AttachedMemory[]> {
  const rows = await db
    .select({
      memoryId: schema.projectMemories.memoryId,
      memoryName: schema.memories.name,
      source: schema.memories.source,
      externalProviderKind: schema.memories.externalProviderKind,
      externalMemoryId: schema.memories.externalMemoryId,
    })
    .from(schema.projectMemories)
    .innerJoin(schema.memories, eq(schema.projectMemories.memoryId, schema.memories.id))
    .where(eq(schema.projectMemories.projectId, projectId));

  return rows;
}

export async function loadSyncedTranslationMemoryMatchesForContext(input: {
  projectId: string;
  memoryIds?: string[];
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  limit?: number;
}): Promise<NormalizedTranslationMemoryMatch[]> {
  const attached = await loadAttachedMemories(input.projectId);
  const memoryIds = input.memoryIds ?? attached.map((item) => item.memoryId);
  if (memoryIds.length === 0) {
    return [];
  }

  const memoryById = new Map(attached.map((memory) => [memory.memoryId, memory]));
  const normalized = normalizeTranslationMemorySourceText(input.sourceText);
  const limit = input.limit ?? 10;

  const exactMatches = await db
    .select({
      id: schema.memoryEntries.id,
      memoryId: schema.memoryEntries.memoryId,
      sourceText: schema.memoryEntries.sourceText,
      targetText: schema.memoryEntries.targetText,
      sourceLocale: schema.memoryEntries.sourceLocale,
      targetLocale: schema.memoryEntries.targetLocale,
      provenance: schema.memoryEntries.provenance,
      matchScore: schema.memoryEntries.matchScore,
      externalKey: schema.memoryEntries.externalKey,
      rank: sql<number>`1`.as("rank"),
    })
    .from(schema.memoryEntries)
    .where(
      and(
        inArray(schema.memoryEntries.memoryId, memoryIds),
        eq(schema.memoryEntries.normalizedSourceText, normalized),
        eq(schema.memoryEntries.sourceLocale, input.sourceLocale),
        inArray(schema.memoryEntries.targetLocale, input.targetLocales),
        eq(schema.memoryEntries.reviewStatus, "approved"),
      ),
    )
    .limit(limit);

  const dbMatches =
    exactMatches.length > 0
      ? exactMatches
      : await (async () => {
          const tsQuery = buildTranslationMemoryTsQuery(input.sourceText);
          if (!tsQuery) {
            return [];
          }

          return db
            .select({
              id: schema.memoryEntries.id,
              memoryId: schema.memoryEntries.memoryId,
              sourceText: schema.memoryEntries.sourceText,
              targetText: schema.memoryEntries.targetText,
              sourceLocale: schema.memoryEntries.sourceLocale,
              targetLocale: schema.memoryEntries.targetLocale,
              provenance: schema.memoryEntries.provenance,
              matchScore: schema.memoryEntries.matchScore,
              externalKey: schema.memoryEntries.externalKey,
              rank: sql<number>`ts_rank(${schema.memoryEntries.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
                "rank",
              ),
            })
            .from(schema.memoryEntries)
            .where(
              and(
                inArray(schema.memoryEntries.memoryId, memoryIds),
                eq(schema.memoryEntries.sourceLocale, input.sourceLocale),
                inArray(schema.memoryEntries.targetLocale, input.targetLocales),
                eq(schema.memoryEntries.reviewStatus, "approved"),
                sql`${schema.memoryEntries.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
              ),
            )
            .orderBy(desc(sql`rank`))
            .limit(limit);
        })();

  return dbMatches.map((entry) => {
    const memory = memoryById.get(entry.memoryId);
    return normalizeSyncedDatabaseTranslationMemoryMatch({
      id: entry.id,
      memoryId: entry.memoryId,
      memoryName: memory?.memoryName ?? "Translation memory",
      sourceText: entry.sourceText,
      targetText: entry.targetText,
      sourceLocale: entry.sourceLocale,
      targetLocale: entry.targetLocale,
      matchScore: entry.matchScore,
      provenance: entry.provenance,
      rank: entry.rank,
      providerKind: memory?.externalProviderKind ?? null,
      externalResourceId: memory?.externalMemoryId ?? null,
      externalSegmentId: entry.externalKey,
    });
  });
}
