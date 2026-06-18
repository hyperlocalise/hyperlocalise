import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { loadSharedSkill } from "@/agents/_runtime/loader";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { loadOrganizationTranslationGenerator } from "@/lib/translation/load-organization-translation-generator";
import { assembleStringTranslationContextSnapshot } from "@/lib/translation/assemble-translation-context";

const translateStringInputSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  sourceText: z.string().min(1),
  targetLocales: z.array(z.string().trim().min(1)).min(1),
  sourceLocale: z.string().trim().min(1).optional(),
  context: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
});

const translateStringOutputSchema = z.object({
  translations: z.array(
    z.object({
      locale: z.string(),
      text: z.string(),
    }),
  ),
});

export type TranslateStringInput = z.infer<typeof translateStringInputSchema>;
export type TranslateStringOutput = z.infer<typeof translateStringOutputSchema>;

export async function executeTranslateString(
  input: TranslateStringInput & { projectId: string },
): Promise<TranslateStringOutput> {
  const generator = await loadOrganizationTranslationGenerator(input.projectId);
  if (!generator.ok) {
    throw new Error(generator.message);
  }

  const bindingContext = [loadSharedSkill("string-translation"), input.context?.trim() || null]
    .filter(Boolean)
    .join("\n\n");

  const jobInput = {
    type: "string" as const,
    sourceText: input.sourceText,
    sourceLocale: input.sourceLocale ?? "en",
    targetLocales: input.targetLocales,
    context: bindingContext || undefined,
    maxLength: input.maxLength,
  };

  const contextSnapshot = await assembleStringTranslationContextSnapshot(input.projectId, jobInput);

  const result = await generator.translateStringJob({
    projectName: generator.project.name,
    projectTranslationContext: generator.project.translationContext,
    jobInput,
    contextSnapshot: contextSnapshot.ok ? contextSnapshot.snapshot : undefined,
  });

  return { translations: result.translations };
}

export function createTranslateStringTool(ctx?: Pick<ToolContext, "projectId">) {
  return defineAgentTool({
    description:
      "Translate source text into one or more target locales using project translation context, glossary, and translation memory.",
    inputSchema: translateStringInputSchema,
    outputSchema: translateStringOutputSchema,
    execute: async (input) => {
      const projectId = input.projectId ?? ctx?.projectId;
      if (!projectId) {
        throw new Error("translate_string requires projectId in tool input or agent context.");
      }

      return executeTranslateString({ ...input, projectId });
    },
  });
}
