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
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { tool } from "ai";
import { z } from "zod";

import * as schema from "@/lib/database/schema";
import { flattenNativeConceptTermsToPairs } from "@/lib/glossary/flatten-native-glossary-pairs";
import { buildGlossaryTsQuery } from "@/lib/glossary/glossary";
import { concordanceSourceContainsTerm } from "@/lib/glossary/native-glossary";
import { groupConceptTerms } from "@/lib/glossary/query-glossary-terms";
import { parseLiveProviderGlossaryId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import {
  toolCanAccessGlossary,
  toolCanAccessProject,
  toolProjectLinkedGlossaryWhere,
  toolProjectLinkedMemoryWhere,
} from "@/lib/tools/tool-access";
import type { ToolContext } from "@/lib/tools/types";

/**
 * Build a prefix-ready tsquery string from free-form user input.
 *
 * Strips characters that have special meaning in Postgres tsquery syntax
 * so that untrusted input cannot break the query.
 */
function buildTsQuery(input: string): string {
  const sanitized = input
    .replace(/[&|!():*<>]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");
  return sanitized;
}

const QUERY_GLOSSARY_CANDIDATE_PAGE_SIZE = 200;

function isNativeGlossaryId(value: string) {
  return z.uuid().safeParse(value).success;
}

export function isQueryableNativeGlossaryId(value: string) {
  return isNativeGlossaryId(value) && parseLiveProviderGlossaryId(value) === null;
}

export const queryGlossaryInputSchema = z.object({
  sourceText: z.string().describe("The source text to look up in glossaries."),
  sourceLocale: z.string().describe("BCP-47 source locale tag."),
  targetLocale: z.string().describe("BCP-47 target locale tag."),
  projectId: z
    .string()
    .optional()
    .describe("Optional project ID to restrict to attached glossaries."),
  glossaryId: z.string().optional().describe("Optional glossary ID to search a single glossary."),
  limit: z.number().min(1).max(20).default(10).describe("Maximum results to return."),
});

export type QueryGlossaryInput = z.infer<typeof queryGlossaryInputSchema>;

export type QueryGlossaryHit = {
  id: string;
  conceptId: string;
  sourceTerm: string;
  targetTerm: string;
  description: string;
  partOfSpeech: string;
  status: string;
  caseSensitive: boolean;
  forbidden: boolean;
  glossaryId: string;
  glossaryName: string;
  rank: number;
};

export type QueryGlossaryResult = {
  terms: QueryGlossaryHit[];
};

/**
 * Search glossary terms for a given source text and locale pair.
 *
 * Uses the existing Postgres full-text search vector (GIN index) on
 * `glossaryTerms.searchVector` for fast lexical retrieval. Results are
 * ranked so that matches in the source term rank higher than matches in
 * the target term or description. Native pairs come from concept-linked
 * terms, not leftover `source_term` / `target_term` columns.
 */
export async function queryGlossaryTerms(
  ctx: ToolContext,
  input: QueryGlossaryInput,
): Promise<QueryGlossaryResult> {
  const { sourceText, sourceLocale, targetLocale, projectId, glossaryId } = input;
  const limit = input.limit ?? 10;
  const db = ctx.db;
  const tsQuery = buildGlossaryTsQuery(sourceText);

  if (!tsQuery) {
    return { terms: [] };
  }

  let glossaryIds: string[] | undefined;
  if (projectId) {
    const accessibleProject = await toolCanAccessProject(ctx, projectId);
    if (!accessibleProject) {
      return { terms: [] };
    }

    const attached = await db
      .select({ glossaryId: schema.projectGlossaries.glossaryId })
      .from(schema.projectGlossaries)
      .where(
        and(
          eq(schema.projectGlossaries.projectId, projectId),
          eq(schema.projectGlossaries.organizationId, ctx.organizationId),
        ),
      );
    glossaryIds = attached.map((row) => row.glossaryId);
    if (glossaryIds.length === 0) {
      return { terms: [] };
    }
  }

  if (glossaryId) {
    if (!isQueryableNativeGlossaryId(glossaryId)) {
      return { terms: [] };
    }

    const accessibleGlossary = await toolCanAccessGlossary(ctx, glossaryId);
    if (!accessibleGlossary) {
      return { terms: [] };
    }

    if (glossaryIds && !glossaryIds.includes(glossaryId)) {
      return { terms: [] };
    }

    glossaryIds = [glossaryId];
  }

  const glossarySourceTerms = alias(schema.glossaryTerms, "glossary_source_terms");

  const sharedConditions = [
    sql`${glossarySourceTerms.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
    await toolProjectLinkedGlossaryWhere(ctx),
    eq(schema.glossaries.sourceLocale, sourceLocale),
    eq(schema.glossaries.status, "active"),
    eq(schema.glossaries.source, "native"),
    eq(glossarySourceTerms.locale, sourceLocale),
    isNotNull(glossarySourceTerms.conceptId),
    isNotNull(glossarySourceTerms.term),
    eq(glossarySourceTerms.reviewStatus, "approved"),
  ];

  if (glossaryIds) {
    sharedConditions.push(inArray(glossarySourceTerms.glossaryId, glossaryIds));
  }

  const rank =
    sql<number>`ts_rank(${glossarySourceTerms.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
      "rank",
    );

  const matchingSources: Array<{
    conceptId: string | null;
    glossaryId: string;
    sourceTerm: string | null;
    caseSensitive: boolean;
    rank: number;
  }> = [];
  let candidateOffset = 0;
  const neededCandidates = Math.max(limit * 5, limit);

  while (matchingSources.length < neededCandidates) {
    const page = await db
      .select({
        conceptId: glossarySourceTerms.conceptId,
        glossaryId: glossarySourceTerms.glossaryId,
        sourceTerm: glossarySourceTerms.term,
        caseSensitive: glossarySourceTerms.caseSensitive,
        rank,
      })
      .from(glossarySourceTerms)
      .innerJoin(schema.glossaries, eq(glossarySourceTerms.glossaryId, schema.glossaries.id))
      .where(and(...sharedConditions))
      .orderBy(desc(rank), asc(glossarySourceTerms.id))
      .limit(QUERY_GLOSSARY_CANDIDATE_PAGE_SIZE)
      .offset(candidateOffset);

    if (page.length === 0) {
      break;
    }

    candidateOffset += page.length;
    for (const row of page) {
      if (
        !row.sourceTerm ||
        !concordanceSourceContainsTerm(sourceText, {
          sourceTerm: row.sourceTerm,
          caseSensitive: row.caseSensitive,
        })
      ) {
        continue;
      }
      matchingSources.push(row);
      if (matchingSources.length >= neededCandidates) {
        break;
      }
    }

    if (page.length < QUERY_GLOSSARY_CANDIDATE_PAGE_SIZE) {
      break;
    }
  }

  const conceptIds = [
    ...new Set(
      matchingSources
        .map((row) => row.conceptId)
        .filter((conceptId): conceptId is string => conceptId !== null),
    ),
  ];

  if (conceptIds.length === 0) {
    return { terms: [] };
  }

  const rankByGlossarySource = new Map<string, number>();
  for (const row of matchingSources) {
    if (!row.sourceTerm) {
      continue;
    }
    const key = `${row.glossaryId}:${row.sourceTerm}`;
    rankByGlossarySource.set(key, Math.max(rankByGlossarySource.get(key) ?? 0, row.rank));
  }

  const conceptRows = await db
    .select({
      id: schema.glossaryTerms.id,
      conceptId: schema.glossaryTerms.conceptId,
      glossaryId: schema.glossaryTerms.glossaryId,
      glossaryName: schema.glossaries.name,
      translatable: schema.glossaryConcepts.translatable,
      locale: schema.glossaryTerms.locale,
      term: schema.glossaryTerms.term,
      status: schema.glossaryTerms.status,
      description: schema.glossaryTerms.description,
      partOfSpeech: schema.glossaryTerms.partOfSpeech,
      caseSensitive: schema.glossaryTerms.caseSensitive,
      provenance: schema.glossaryTerms.provenance,
      reviewStatus: schema.glossaryTerms.reviewStatus,
      forbidden: schema.glossaryTerms.forbidden,
    })
    .from(schema.glossaryTerms)
    .innerJoin(
      schema.glossaryConcepts,
      eq(schema.glossaryTerms.conceptId, schema.glossaryConcepts.id),
    )
    .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        inArray(schema.glossaryTerms.conceptId, conceptIds),
        eq(schema.glossaries.organizationId, ctx.organizationId),
        eq(schema.glossaries.source, "native"),
        eq(schema.glossaries.sourceLocale, sourceLocale),
        eq(schema.glossaries.status, "active"),
        isNotNull(schema.glossaryTerms.term),
        isNotNull(schema.glossaryTerms.locale),
        eq(schema.glossaryTerms.reviewStatus, "approved"),
      ),
    );

  const pairs = flattenNativeConceptTermsToPairs({
    concepts: groupConceptTerms(
      conceptRows.map((row) => ({
        ...row,
        conceptId: row.conceptId!,
      })),
    ),
    sourceLocale,
    targetLocales: [targetLocale],
  });

  const terms = pairs
    .filter((pair) => rankByGlossarySource.has(`${pair.glossaryId}:${pair.sourceTerm}`))
    .map((pair) => ({
      id: pair.id,
      conceptId: pair.conceptId,
      sourceTerm: pair.sourceTerm,
      targetTerm: pair.targetTerm,
      description: pair.description,
      partOfSpeech: pair.partOfSpeech,
      status: pair.status,
      caseSensitive: pair.caseSensitive,
      forbidden: pair.forbidden,
      glossaryId: pair.glossaryId,
      glossaryName: pair.glossaryName,
      rank: rankByGlossarySource.get(`${pair.glossaryId}:${pair.sourceTerm}`) ?? 0,
    }))
    .toSorted((left, right) => right.rank - left.rank)
    .slice(0, limit);

  return { terms };
}

/**
 * Search glossary terms for a given source text and locale pair.
 *
 * Uses the existing Postgres full-text search vector (GIN index) on
 * `glossaryTerms.searchVector` for fast lexical retrieval. Results are
 * ranked so that matches in the source term rank higher than matches in
 * the target term or description.
 */
export function createQueryGlossaryTool(ctx: ToolContext) {
  return tool({
    description:
      "Search glossary terms for a source text and locale pair. Returns matching terms with preferred translations.",
    inputSchema: queryGlossaryInputSchema,
    execute: async (input) => queryGlossaryTerms(ctx, input),
  });
}

/**
 * Search translation memory entries for a source text and locale pair.
 *
 * First tries an exact match on `normalizedSourceText` (fast, deterministic).
 * If no exact match is found, falls back to the full-text search vector on
 * `memoryEntries.searchVector` for lexical similarity.
 */
export function createQueryTranslationMemoryTool(ctx: ToolContext) {
  return tool({
    description: "Search translation memory for previous accepted translations of a source text.",
    inputSchema: z.object({
      sourceText: z.string().describe("The source text to search for in translation memory."),
      sourceLocale: z.string().describe("BCP-47 source locale tag."),
      targetLocale: z.string().describe("BCP-47 target locale tag."),
      projectId: z
        .string()
        .optional()
        .describe("Optional project ID to restrict to attached memories."),
      limit: z.number().min(1).max(10).default(5).describe("Maximum results to return."),
    }),
    execute: async ({ sourceText, sourceLocale, targetLocale, projectId, limit }) => {
      const db = ctx.db;
      const normalized = normalizeTranslationMemorySourceText(sourceText);

      let memoryIds: string[] | undefined;
      if (projectId) {
        const accessibleProject = await toolCanAccessProject(ctx, projectId);
        if (!accessibleProject) {
          return { matches: [] };
        }

        const attached = await db
          .select({ memoryId: schema.projectMemories.memoryId })
          .from(schema.projectMemories)
          .where(
            and(
              eq(schema.projectMemories.projectId, projectId),
              eq(schema.projectMemories.organizationId, ctx.organizationId),
            ),
          );
        memoryIds = attached.map((a) => a.memoryId);
        if (memoryIds.length === 0) {
          return { matches: [] };
        }
      }

      // Exact match on normalized text first.
      const exactConditions = [
        eq(schema.memoryEntries.normalizedSourceText, normalized),
        eq(schema.memoryEntries.sourceLocale, sourceLocale),
        eq(schema.memoryEntries.targetLocale, targetLocale),
        eq(schema.memoryEntries.reviewStatus, "approved"),
        await toolProjectLinkedMemoryWhere(ctx),
      ];
      if (memoryIds) {
        exactConditions.push(inArray(schema.memoryEntries.memoryId, memoryIds));
      }

      const exactMatches = await db
        .select({
          id: schema.memoryEntries.id,
          sourceText: schema.memoryEntries.sourceText,
          targetText: schema.memoryEntries.targetText,
          sourceLocale: schema.memoryEntries.sourceLocale,
          targetLocale: schema.memoryEntries.targetLocale,
          matchScore: schema.memoryEntries.matchScore,
          provenance: schema.memoryEntries.provenance,
        })
        .from(schema.memoryEntries)
        .innerJoin(schema.memories, eq(schema.memoryEntries.memoryId, schema.memories.id))
        .where(and(...exactConditions))
        .limit(limit);

      if (exactMatches.length > 0) {
        return {
          matches: exactMatches.map((m) => ({ ...m, rank: 1.0 })),
        };
      }

      // Fallback to lexical full-text search.
      const tsQuery = buildTsQuery(sourceText);
      if (!tsQuery) {
        return { matches: [] };
      }

      const fuzzyConditions = [
        sql`${schema.memoryEntries.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
        eq(schema.memoryEntries.sourceLocale, sourceLocale),
        eq(schema.memoryEntries.targetLocale, targetLocale),
        eq(schema.memoryEntries.reviewStatus, "approved"),
        await toolProjectLinkedMemoryWhere(ctx),
      ];
      if (memoryIds) {
        fuzzyConditions.push(inArray(schema.memoryEntries.memoryId, memoryIds));
      }

      const fuzzyMatches = await db
        .select({
          id: schema.memoryEntries.id,
          sourceText: schema.memoryEntries.sourceText,
          targetText: schema.memoryEntries.targetText,
          sourceLocale: schema.memoryEntries.sourceLocale,
          targetLocale: schema.memoryEntries.targetLocale,
          matchScore: schema.memoryEntries.matchScore,
          provenance: schema.memoryEntries.provenance,
          rank: sql<number>`ts_rank(${schema.memoryEntries.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
            "rank",
          ),
        })
        .from(schema.memoryEntries)
        .innerJoin(schema.memories, eq(schema.memoryEntries.memoryId, schema.memories.id))
        .where(and(...fuzzyConditions))
        .orderBy(desc(sql`rank`))
        .limit(limit);

      return {
        matches: fuzzyMatches.map((m) => ({
          id: m.id,
          sourceText: m.sourceText,
          targetText: m.targetText,
          sourceLocale: m.sourceLocale,
          targetLocale: m.targetLocale,
          matchScore: m.matchScore,
          provenance: m.provenance,
          rank: m.rank,
        })),
      };
    },
  });
}
