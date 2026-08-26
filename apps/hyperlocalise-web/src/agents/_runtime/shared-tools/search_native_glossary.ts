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
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { schema } from "@/lib/database";
import { searchGlossaryConcordance } from "@/lib/glossary/glossary-concordance";
import { toolCanAccessProject, toolProjectLinkedGlossaryWhere } from "@/lib/tools/tool-access";

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

async function resolveNativeGlossaryIds(
  ctx: ToolContext,
  input: { projectId?: string; sourceLocale: string },
): Promise<string[] | { error: string }> {
  if (input.projectId) {
    const accessibleProject = await toolCanAccessProject(ctx, input.projectId);
    if (!accessibleProject) {
      return { error: "Project not found or not accessible." };
    }

    const attached = await ctx.db
      .select({ glossaryId: schema.projectGlossaries.glossaryId })
      .from(schema.projectGlossaries)
      .innerJoin(schema.glossaries, eq(schema.projectGlossaries.glossaryId, schema.glossaries.id))
      .where(
        and(
          eq(schema.projectGlossaries.projectId, input.projectId),
          eq(schema.projectGlossaries.organizationId, ctx.organizationId),
          eq(schema.glossaries.source, "native"),
          eq(schema.glossaries.sourceLocale, input.sourceLocale),
          eq(schema.glossaries.status, "active"),
        ),
      );

    return attached.map((row) => row.glossaryId);
  }

  const linkedGlossaryWhere = await toolProjectLinkedGlossaryWhere(ctx);
  const glossaries = await ctx.db
    .select({ id: schema.glossaries.id })
    .from(schema.glossaries)
    .where(
      and(
        linkedGlossaryWhere,
        eq(schema.glossaries.source, "native"),
        eq(schema.glossaries.sourceLocale, input.sourceLocale),
        eq(schema.glossaries.status, "active"),
      ),
    );

  return glossaries.map((glossary) => glossary.id);
}

export function createSearchNativeGlossaryTool(ctx: ToolContext) {
  return defineAgentTool({
    description:
      "Search Hyperlocalise-native glossary terms for a source text and locale pair. Does not search Crowdin or other external TMS glossaries.",
    inputSchema: searchNativeGlossaryInputSchema,
    outputSchema: searchNativeGlossaryOutputSchema,
    execute: async (input) => {
      if (ctx.glossarySearchEnabled !== true) {
        return {
          success: false,
          error: "Glossary search is not enabled for this workspace.",
        };
      }

      const projectId = input.projectId ?? ctx.projectId ?? undefined;
      const glossaryIdsResult = await resolveNativeGlossaryIds(ctx, {
        projectId,
        sourceLocale: input.sourceLocale,
      });
      if ("error" in glossaryIdsResult) {
        return {
          success: false,
          error: glossaryIdsResult.error,
        };
      }

      if (glossaryIdsResult.length === 0) {
        return { success: true, terms: [] };
      }

      const matches = await searchGlossaryConcordance({
        organizationId: ctx.organizationId,
        projectId,
        glossaryIds: projectId ? undefined : glossaryIdsResult,
        sourceLocale: input.sourceLocale,
        targetLocales: [input.targetLocale],
        sourceText: input.sourceText,
        limit: input.limit,
      });

      return {
        success: true,
        terms: matches.map((match) => ({
          id: match.id,
          sourceTerm: match.sourceTerm,
          targetTerm: match.targetTerm,
          description: match.description,
          forbidden: match.termStatus.forbidden,
          glossaryId: match.glossaryId,
          glossaryName: match.glossaryName,
          rank: match.rank,
        })),
      };
    },
  });
}
