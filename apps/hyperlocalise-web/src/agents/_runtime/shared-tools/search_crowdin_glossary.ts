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
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { crowdinTmsProvider } from "@/lib/providers/adapters/crowdin/crowdin-provider";
import { isErr } from "@/lib/primitives/result/results";

const searchCrowdinGlossaryInputSchema = z.object({
  expressions: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(20)
    .describe("Source expressions or terms to look up in Crowdin glossaries."),
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
  projectId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Optional Hyperlocalise project ID linked to Crowdin. When set, searches that project's glossaries; otherwise searches organization glossaries.",
    ),
  limit: z.number().int().min(1).max(50).default(20).describe("Maximum matches to return."),
});

const searchCrowdinGlossaryOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  scope: z.enum(["organization", "project"]).optional(),
  crowdinProjectId: z.number().nullable().optional(),
  matches: z
    .array(
      z.object({
        glossaryId: z.number(),
        glossaryName: z.string(),
        sourceTerm: z.string(),
        targetTerm: z.string(),
        status: z.string().nullable(),
        description: z.string().nullable(),
      }),
    )
    .optional(),
});

export type SearchCrowdinGlossaryToolInput = z.infer<typeof searchCrowdinGlossaryInputSchema>;
export type SearchCrowdinGlossaryToolOutput = z.infer<typeof searchCrowdinGlossaryOutputSchema>;

export function createSearchCrowdinGlossaryTool(
  ctx: Pick<ToolContext, "organizationId" | "localUserId" | "projectId">,
) {
  return defineAgentTool({
    description:
      "Search Crowdin glossaries for preferred or forbidden terminology. Uses the conversation project when set; pass projectId to override, or omit both for organization glossaries.",
    inputSchema: searchCrowdinGlossaryInputSchema,
    outputSchema: searchCrowdinGlossaryOutputSchema,
    execute: async (input) => {
      const projectId = input.projectId ?? ctx.projectId ?? undefined;
      const result = await crowdinTmsProvider.searchGlossaryForAgent({
        organizationId: ctx.organizationId,
        actorUserId: ctx.localUserId,
        projectId,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        expressions: input.expressions,
        limit: input.limit,
      });

      if (isErr(result)) {
        return {
          success: false,
          error: result.error.message,
        };
      }

      return {
        success: true,
        scope: result.value.scope,
        crowdinProjectId: result.value.crowdinProjectId,
        matches: result.value.matches,
      };
    },
  });
}
