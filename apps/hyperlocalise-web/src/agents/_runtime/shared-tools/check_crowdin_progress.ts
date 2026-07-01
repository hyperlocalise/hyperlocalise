import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { checkCrowdinProgress } from "@/lib/providers/adapters/crowdin/crowdin-progress";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { isErr } from "@/lib/primitives/result/results";

const checkCrowdinProgressInputSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  scope: z
    .enum(["project", "file", "string"])
    .describe("Progress scope: whole Crowdin project, a source file, or a single string."),
  languageIds: z
    .array(z.string().trim().min(1))
    .optional()
    .describe("Optional Crowdin language IDs to filter results, for example ['fr', 'de']."),
  filePath: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Crowdin file path or name when scope is file."),
  fileId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Crowdin numeric file ID when scope is file."),
  stringIdentifier: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Crowdin string identifier/key when scope is string."),
  stringId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Crowdin numeric string ID when scope is string."),
  targetLocale: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Optional target locale for detailed file queue counts (untranslated, needs review, etc.).",
    ),
});

const checkCrowdinProgressOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  progress: z
    .object({
      scope: z.enum(["project", "file", "string"]),
      crowdinProjectId: z.number(),
      crowdinProjectName: z.string(),
      resource: z
        .object({
          type: z.enum(["file", "string"]),
          id: z.number(),
          path: z.string().optional(),
          identifier: z.string().optional(),
          text: z.string().optional(),
        })
        .optional(),
      languages: z.array(
        z.object({
          languageId: z.string(),
          translationProgress: z.number(),
          approvalProgress: z.number(),
          words: z.object({
            total: z.number(),
            translated: z.number(),
            approved: z.number(),
          }),
          phrases: z.object({
            total: z.number(),
            translated: z.number(),
            approved: z.number(),
          }),
        }),
      ),
      queueSummary: z
        .object({
          targetLocale: z.string(),
          total: z.number(),
          reviewed: z.number(),
          untranslated: z.number(),
          needsReview: z.number(),
          hasIssues: z.number(),
        })
        .optional(),
      stringTranslations: z
        .array(
          z.object({
            languageId: z.string(),
            translated: z.boolean(),
            approved: z.boolean(),
            text: z.string().nullable(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type CheckCrowdinProgressToolInput = z.infer<typeof checkCrowdinProgressInputSchema>;
export type CheckCrowdinProgressToolOutput = z.infer<typeof checkCrowdinProgressOutputSchema>;

export function createCheckCrowdinProgressTool(
  ctx: Pick<ToolContext, "organizationId" | "projectId">,
) {
  return defineAgentTool({
    description:
      "Check Crowdin translation progress for the linked TMS project, a specific source file, or an individual string. Requires the Hyperlocalise project to be connected to Crowdin.",
    inputSchema: checkCrowdinProgressInputSchema,
    outputSchema: checkCrowdinProgressOutputSchema,
    execute: async (input) => {
      const projectId = input.projectId ?? ctx.projectId;
      if (!projectId) {
        return {
          success: false,
          error:
            "check_crowdin_progress requires a project. Attach a Hyperlocalise project linked to Crowdin, or pass projectId.",
        };
      }

      const result = await checkCrowdinProgress({
        organizationId: ctx.organizationId,
        projectId,
        scope: input.scope,
        languageIds: input.languageIds,
        filePath: input.filePath,
        fileId: input.fileId,
        stringIdentifier: input.stringIdentifier,
        stringId: input.stringId,
        targetLocale: input.targetLocale,
      });

      if (isErr(result)) {
        return {
          success: false,
          error: result.error.message,
        };
      }

      return {
        success: true,
        progress: result.value,
      };
    },
  });
}
