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
import type { ToolSet } from "ai";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import { ensureOrganizationProjectRecord } from "@/lib/projects/organization/organization-project-service";
import { crowdinTmsProvider } from "@/lib/providers/adapters/crowdin/crowdin-provider";
import { generateCatAiRecommendation } from "@/lib/translation/cat";

const searchConcordanceInputSchema = z.object({
  expressions: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(20)
    .describe("Source strings or terms to look up in Crowdin glossary and translation memory."),
  sourceLocale: z
    .string()
    .trim()
    .min(1)
    .describe("Crowdin source language ID, for example 'en' or 'en-US'."),
  targetLocale: z
    .string()
    .trim()
    .min(1)
    .describe("Crowdin target language ID, for example 'de' or 'vi'."),
});

const recommendTranslationInputSchema = z.object({
  sourceText: z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .describe("Source string to recommend a translation for."),
  sourceLocale: z.string().trim().min(1).describe("Source language ID."),
  targetLocale: z.string().trim().min(1).describe("Target language ID."),
  context: z
    .string()
    .trim()
    .max(8000)
    .optional()
    .describe("Surrounding UI, code, or reviewer context for the string."),
  key: z.string().trim().max(512).optional().describe("Optional string key or identifier."),
  glossaryTerms: z
    .array(
      z.object({
        sourceTerm: z.string(),
        targetTerm: z.string(),
        status: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .optional()
    .describe("Optional glossary matches from search_concordance."),
  translationMemoryMatches: z
    .array(
      z.object({
        sourceText: z.string(),
        targetText: z.string(),
      }),
    )
    .optional()
    .describe("Optional translation-memory matches from search_concordance."),
});

export function createCrowdinReviewTools(input: {
  organizationId: string;
  projectId: string;
  actorUserId?: string | null;
}): ToolSet {
  return {
    search_concordance: defineAgentTool({
      description:
        "Search Crowdin glossary and translation memory for source expressions in a locale pair.",
      inputSchema: searchConcordanceInputSchema,
      execute: async ({ expressions, sourceLocale, targetLocale }, { abortSignal } = {}) => {
        const result = await crowdinTmsProvider.searchConcordanceForAgent({
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          projectId: input.projectId,
          sourceLocale,
          targetLocale,
          expressions,
          signal: abortSignal,
        });
        if (isErr(result)) {
          return {
            success: false,
            error: result.error.message,
          };
        }

        return {
          success: true,
          crowdinProjectId: result.value.crowdinProjectId,
          glossaryMatches: result.value.glossaryMatches,
          translationMemoryMatches: result.value.translationMemoryMatches,
        };
      },
    }),
    get_style_guide: defineAgentTool({
      description:
        "Load Hyperlocalise project translation context and Crowdin AI style prompts that apply to this project.",
      inputSchema: z.object({}),
      execute: async (_input, { abortSignal } = {}) => {
        const [project] = await db
          .select({
            name: schema.projects.name,
            translationContext: schema.projects.translationContext,
          })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.organizationId, input.organizationId),
              eq(schema.projects.id, input.projectId),
            ),
          )
          .limit(1);

        const styleResult = await crowdinTmsProvider.loadStyleGuideForAgent({
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          projectId: input.projectId,
          signal: abortSignal,
        });
        if (isErr(styleResult)) {
          return {
            success: false,
            error: styleResult.error.message,
            projectName: project?.name ?? null,
            translationContext: project?.translationContext?.trim() || null,
          };
        }

        return {
          success: true,
          crowdinProjectId: styleResult.value.crowdinProjectId,
          projectName: project?.name ?? null,
          translationContext: project?.translationContext?.trim() || null,
          prompts: styleResult.value.prompts,
        };
      },
    }),
    recommend_translation: defineAgentTool({
      description:
        "Recommend a translation grounded in Crowdin concordance, project context, and style guidance. Read-only; does not write back to Crowdin.",
      inputSchema: recommendTranslationInputSchema,
      execute: async (recommendationInput, { abortSignal } = {}) => {
        const ensured = await ensureOrganizationProjectRecord({
          organizationId: input.organizationId,
          projectId: input.projectId,
          userId: input.actorUserId,
        });
        if (isErr(ensured)) {
          return {
            success: false,
            error: "The selected Crowdin project is not available for translation recommendations.",
          };
        }

        const result = await generateCatAiRecommendation(
          {
            projectId: ensured.value,
            organizationId: input.organizationId,
            sourcePath: "automation-review",
            filename: "review",
            sourceLocale: recommendationInput.sourceLocale,
            targetLocale: recommendationInput.targetLocale,
            key: recommendationInput.key?.trim() || recommendationInput.sourceText.slice(0, 120),
            sourceText: recommendationInput.sourceText,
            context: recommendationInput.context ?? null,
            glossaryTerms: recommendationInput.glossaryTerms?.map((term) => ({
              sourceTerm: term.sourceTerm,
              targetTerm: term.targetTerm,
              targetLocale: recommendationInput.targetLocale,
              forbidden: term.status === "forbidden",
              description: term.description,
            })),
            translationMemoryMatches: recommendationInput.translationMemoryMatches?.map(
              (match) => ({
                sourceText: match.sourceText,
                targetText: match.targetText,
                targetLocale: recommendationInput.targetLocale,
              }),
            ),
          },
          { signal: abortSignal },
        );
        if (isErr(result)) {
          return {
            success: false,
            error: result.error.message,
          };
        }

        return {
          success: true,
          suggestion: result.value.aiSuggestion,
          reasoning: result.value.aiReasoning,
        };
      },
    }),
  };
}
