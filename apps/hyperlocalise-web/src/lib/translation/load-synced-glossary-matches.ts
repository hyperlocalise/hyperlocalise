import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { buildGlossaryTsQuery } from "@/lib/translation/glossary-search-query";
import {
  normalizeSyncedDatabaseGlossaryMatch,
  type NormalizedGlossaryMatch,
} from "@/lib/translation/glossary-match";

type AttachedGlossary = {
  glossaryId: string;
  glossaryName: string;
  source: (typeof schema.projectSourceEnum.enumValues)[number];
  externalProviderKind: ExternalTmsProviderKind | null;
  externalGlossaryId: string | null;
};

async function loadAttachedGlossaries(projectId: string): Promise<AttachedGlossary[]> {
  const rows = await db
    .select({
      glossaryId: schema.projectGlossaries.glossaryId,
      glossaryName: schema.glossaries.name,
      source: schema.glossaries.source,
      externalProviderKind: schema.glossaries.externalProviderKind,
      externalGlossaryId: schema.glossaries.externalGlossaryId,
    })
    .from(schema.projectGlossaries)
    .innerJoin(schema.glossaries, eq(schema.projectGlossaries.glossaryId, schema.glossaries.id))
    .where(eq(schema.projectGlossaries.projectId, projectId));

  return rows;
}

export async function loadSyncedGlossaryMatchesForContext(input: {
  projectId: string;
  glossaryIds?: string[];
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
  limit?: number;
}): Promise<NormalizedGlossaryMatch[]> {
  const attached = await loadAttachedGlossaries(input.projectId);
  const glossaryIds = input.glossaryIds ?? attached.map((item) => item.glossaryId);
  if (glossaryIds.length === 0) {
    return [];
  }

  const glossaryById = new Map(attached.map((glossary) => [glossary.glossaryId, glossary]));
  const tsQuery = buildGlossaryTsQuery(input.sourceText);
  if (!tsQuery) {
    return [];
  }

  const limit = input.limit ?? 20;

  const dbMatches = await db
    .select({
      id: schema.glossaryTerms.id,
      glossaryId: schema.glossaryTerms.glossaryId,
      glossaryName: schema.glossaries.name,
      sourceTerm: schema.glossaryTerms.sourceTerm,
      targetTerm: schema.glossaryTerms.targetTerm,
      sourceLocale: schema.glossaries.sourceLocale,
      targetLocale: schema.glossaries.targetLocale,
      description: schema.glossaryTerms.description,
      forbidden: schema.glossaryTerms.forbidden,
      caseSensitive: schema.glossaryTerms.caseSensitive,
      externalKey: schema.glossaryTerms.externalKey,
      rank: sql<number>`ts_rank(${schema.glossaryTerms.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
        "rank",
      ),
    })
    .from(schema.glossaryTerms)
    .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        inArray(schema.glossaryTerms.glossaryId, glossaryIds),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        inArray(schema.glossaries.targetLocale, input.targetLocales),
        eq(schema.glossaries.status, "active"),
        eq(schema.glossaryTerms.reviewStatus, "approved"),
        sql`${schema.glossaryTerms.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
      ),
    )
    .orderBy(desc(sql`rank`))
    .limit(limit);

  return dbMatches.map((entry) => {
    const glossary = glossaryById.get(entry.glossaryId);
    return normalizeSyncedDatabaseGlossaryMatch({
      id: entry.id,
      glossaryId: entry.glossaryId,
      glossaryName: entry.glossaryName,
      sourceTerm: entry.sourceTerm,
      targetTerm: entry.targetTerm,
      sourceLocale: entry.sourceLocale,
      targetLocale: entry.targetLocale,
      description: entry.description,
      forbidden: entry.forbidden,
      caseSensitive: entry.caseSensitive,
      rank: Number(entry.rank) || 1,
      providerKind: glossary?.externalProviderKind ?? null,
      externalResourceId: glossary?.externalGlossaryId ?? null,
      externalTermId: entry.externalKey,
    });
  });
}
