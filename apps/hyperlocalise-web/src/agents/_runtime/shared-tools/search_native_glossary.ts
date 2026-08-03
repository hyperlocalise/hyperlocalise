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
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { schema } from "@/lib/database";
import { toolCanAccessProject, toolProjectLinkedGlossaryWhere } from "@/lib/tools/tool-access";

import { buildNativeGlossaryTsQuery } from "./build-native-glossary-tsquery";

const searchNativeGlossaryInputSchema = z.object({
  sourceText: z
    .string()
    .trim()
    .min(1)
    .describe("Source text or term to look up in native glossaries."),
  sourceLocale: z.string().trim().min(1).describe("BCP-47 source locale tag."),
  targetLocale: z.string().trim().min(1).describe("BCP-47 target locale tag."),
  projectId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional Hyperlocalise project ID to restrict to attached native glossaries."),
  limit: z.number().int().min(1).max(20).default(10).describe("Maximum results to return."),
});

const searchNativeGlossaryOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  terms: z
    .array(
      z.object({
        id: z.string(),
        sourceTerm: z.string(),
        targetTerm: z.string(),
        description: z.string().nullable(),
        forbidden: z.boolean().nullable(),
        glossaryId: z.string(),
        glossaryName: z.string(),
        rank: z.number(),
      }),
    )
    .optional(),
});

export type SearchNativeGlossaryToolInput = z.infer<typeof searchNativeGlossaryInputSchema>;
export type SearchNativeGlossaryToolOutput = z.infer<typeof searchNativeGlossaryOutputSchema>;

export function createSearchNativeGlossaryTool(ctx: ToolContext) {
  return defineAgentTool({
    description:
      "Search Hyperlocalise-native glossary terms for a source text and locale pair. Does not search Crowdin or other external TMS glossaries.",
    inputSchema: searchNativeGlossaryInputSchema,
    outputSchema: searchNativeGlossaryOutputSchema,
    execute: async (input) => {
      const projectId = input.projectId ?? ctx.projectId ?? undefined;
      const tsQuery = buildNativeGlossaryTsQuery(input.sourceText);
      if (!tsQuery) {
        return { success: true, terms: [] };
      }

      let glossaryIds: string[] | undefined;
      if (projectId) {
        const accessibleProject = await toolCanAccessProject(ctx, projectId);
        if (!accessibleProject) {
          return {
            success: false,
            error: "Project not found or not accessible.",
          };
        }

        const attached = await ctx.db
          .select({ glossaryId: schema.projectGlossaries.glossaryId })
          .from(schema.projectGlossaries)
          .innerJoin(
            schema.glossaries,
            eq(schema.projectGlossaries.glossaryId, schema.glossaries.id),
          )
          .where(
            and(
              eq(schema.projectGlossaries.projectId, projectId),
              eq(schema.projectGlossaries.organizationId, ctx.organizationId),
              eq(schema.glossaries.source, "native"),
            ),
          );
        glossaryIds = attached.map((row) => row.glossaryId);
        if (glossaryIds.length === 0) {
          return { success: true, terms: [] };
        }
      }

      const conditions = [
        sql`${schema.glossaryTerms.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
        await toolProjectLinkedGlossaryWhere(ctx),
        eq(schema.glossaries.source, "native"),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        eq(schema.glossaries.targetLocale, input.targetLocale),
        eq(schema.glossaries.status, "active"),
        eq(schema.glossaryTerms.reviewStatus, "approved"),
      ];

      if (glossaryIds) {
        conditions.push(inArray(schema.glossaryTerms.glossaryId, glossaryIds));
      }

      const terms = await ctx.db
        .select({
          id: schema.glossaryTerms.id,
          sourceTerm: schema.glossaryTerms.sourceTerm,
          targetTerm: schema.glossaryTerms.targetTerm,
          description: schema.glossaryTerms.description,
          forbidden: schema.glossaryTerms.forbidden,
          glossaryId: schema.glossaryTerms.glossaryId,
          glossaryName: schema.glossaries.name,
          rank: sql<number>`ts_rank(${schema.glossaryTerms.searchVector}, to_tsquery('simple', ${tsQuery}))`.as(
            "rank",
          ),
        })
        .from(schema.glossaryTerms)
        .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
        .where(and(...conditions))
        .orderBy(desc(sql`rank`))
        .limit(input.limit);

      return {
        success: true,
        terms: terms.map((term) => ({
          id: term.id,
          sourceTerm: term.sourceTerm,
          targetTerm: term.targetTerm,
          description: term.description,
          forbidden: term.forbidden,
          glossaryId: term.glossaryId,
          glossaryName: term.glossaryName,
          rank: term.rank,
        })),
      };
    },
  });
}
