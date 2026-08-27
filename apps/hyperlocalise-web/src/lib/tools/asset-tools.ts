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
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import {
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
    inputSchema: z.object({
      sourceText: z.string().describe("The source text to look up in glossaries."),
      sourceLocale: z.string().describe("BCP-47 source locale tag."),
      targetLocale: z.string().describe("BCP-47 target locale tag."),
      projectId: z
        .string()
        .optional()
        .describe("Optional project ID to restrict to attached glossaries."),
      limit: z.number().min(1).max(20).default(10).describe("Maximum results to return."),
    }),
    execute: async ({ sourceText, sourceLocale, targetLocale, projectId, limit }) => {
      const db = ctx.db;
      const tsQuery = buildTsQuery(sourceText);

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
        glossaryIds = attached.map((a) => a.glossaryId);
        if (glossaryIds.length === 0) {
          return { terms: [] };
        }
      }

      const glossarySourceTerms = alias(schema.glossaryTerms, "glossary_source_terms");
      const glossaryTargetTerms = alias(schema.glossaryTerms, "glossary_target_terms");

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

      const [translatableTerms, nonTranslatableTerms] = await Promise.all([
        db
          .select({
            id: glossaryTargetTerms.id,
            sourceTerm: sql<string>`${glossarySourceTerms.term}`,
            targetTerm: sql<string>`${glossaryTargetTerms.term}`,
            description: glossarySourceTerms.description,
            partOfSpeech: glossarySourceTerms.partOfSpeech,
            caseSensitive: glossarySourceTerms.caseSensitive,
            forbidden: glossarySourceTerms.forbidden,
            glossaryId: glossarySourceTerms.glossaryId,
            glossaryName: schema.glossaries.name,
            rank,
          })
          .from(glossarySourceTerms)
          .innerJoin(
            glossaryTargetTerms,
            and(
              eq(glossarySourceTerms.glossaryId, glossaryTargetTerms.glossaryId),
              eq(glossarySourceTerms.conceptId, glossaryTargetTerms.conceptId),
            ),
          )
          .innerJoin(
            schema.glossaryConcepts,
            and(
              eq(schema.glossaryConcepts.id, glossarySourceTerms.conceptId),
              eq(schema.glossaryConcepts.translatable, true),
            ),
          )
          .innerJoin(schema.glossaries, eq(glossarySourceTerms.glossaryId, schema.glossaries.id))
          .where(
            and(
              ...sharedConditions,
              eq(glossaryTargetTerms.locale, targetLocale),
              isNotNull(glossaryTargetTerms.term),
              eq(glossaryTargetTerms.reviewStatus, "approved"),
            ),
          ),
        db
          .select({
            id: glossarySourceTerms.id,
            sourceTerm: sql<string>`${glossarySourceTerms.term}`,
            targetTerm: sql<string>`${glossarySourceTerms.term}`,
            description: glossarySourceTerms.description,
            partOfSpeech: glossarySourceTerms.partOfSpeech,
            caseSensitive: glossarySourceTerms.caseSensitive,
            forbidden: glossarySourceTerms.forbidden,
            glossaryId: glossarySourceTerms.glossaryId,
            glossaryName: schema.glossaries.name,
            rank,
          })
          .from(glossarySourceTerms)
          .innerJoin(
            schema.glossaryConcepts,
            and(
              eq(schema.glossaryConcepts.id, glossarySourceTerms.conceptId),
              eq(schema.glossaryConcepts.translatable, false),
            ),
          )
          .innerJoin(schema.glossaries, eq(glossarySourceTerms.glossaryId, schema.glossaries.id))
          .where(and(...sharedConditions)),
      ]);

      const terms = [...translatableTerms, ...nonTranslatableTerms]
        .toSorted((left, right) => right.rank - left.rank)
        .slice(0, limit);

      return {
        terms: terms.map((t) => ({
          id: t.id,
          sourceTerm: t.sourceTerm,
          targetTerm: t.targetTerm,
          description: t.description,
          partOfSpeech: t.partOfSpeech,
          caseSensitive: t.caseSensitive,
          forbidden: t.forbidden,
          glossaryId: t.glossaryId,
          glossaryName: t.glossaryName,
          rank: t.rank,
        })),
      };
    },
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
