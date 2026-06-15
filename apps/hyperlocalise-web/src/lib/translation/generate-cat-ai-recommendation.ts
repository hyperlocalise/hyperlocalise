import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import { err, ok, type Result } from "@/lib/primitives/result/results";

import { assembleStringTranslationContextSnapshot } from "./assemble-translation-context";
import { loadOrganizationTranslationModel } from "./load-organization-translation-generator";

const catAiRecommendationOutputSchema = z.object({
  suggestion: z.string().refine((text) => text.trim().length > 0, {
    message: "Suggestion text cannot be empty",
  }),
  reasoning: z.string().refine((text) => text.trim().length > 0, {
    message: "Reasoning cannot be empty",
  }),
});

export type CatAiRecommendationInput = {
  projectId: string;
  organizationId: string;
  sourcePath: string;
  filename: string;
  sourceLocale: string;
  targetLocale: string;
  key: string;
  sourceText: string;
  targetText?: string;
  context?: string | null;
  agentContext?: string | null;
  maxLength?: number;
};

export type CatAiRecommendationResult = {
  aiSuggestion: string;
  aiReasoning: string;
};

export type CatAiRecommendationError = {
  code:
    | "translation_project_not_found"
    | "provider_credential_invalid"
    | "provider_credential_missing"
    | "translation_context_assembly_failed"
    | "ai_recommendation_failed";
  message: string;
};

function estimateCatRecommendationMaxOutputTokens(input: CatAiRecommendationInput) {
  const sourceBudget = Math.ceil(input.sourceText.length / 2);
  const contextBudget = Math.ceil(
    ((input.context?.length ?? 0) + (input.agentContext?.length ?? 0)) / 4,
  );
  return Math.min(4_000, Math.max(512, sourceBudget + contextBudget + 256));
}

function buildCatRecommendationSystemPrompt(input: {
  projectName: string;
  projectTranslationContext: string;
  knowledgeMemory?: string;
  glossaryTerms: Array<{
    sourceTerm: string;
    targetTerm: string;
    targetLocale: string;
    forbidden?: boolean | null;
    description?: string | null;
  }>;
  translationMemoryMatches: Array<{
    sourceText: string;
    targetText: string;
    targetLocale: string;
  }>;
}) {
  const glossaryTerms = input.glossaryTerms;
  const translationMemoryMatches = input.translationMemoryMatches;
  const knowledgeMemory = input.knowledgeMemory?.trim();

  const instructions = [
    "You are an expert software localization assistant helping a human reviewer in a CAT tool.",
    "Recommend the best target-locale translation for the provided source string.",
    "Preserve meaning, tone, placeholders, HTML, Markdown, punctuation, whitespace, and line breaks.",
    "Follow project translation context, file context, and repository context as binding style and usage guidance.",
    "Follow workspace knowledge memory when present.",
    "Use glossary terms exactly for the target locale. Do not use forbidden glossary terms.",
    "Use approved translation memory matches as consistency references when they apply.",
    "If constraints conflict, prioritize placeholder and markup preservation first, then glossary rules, then project context, file context, repository context, workspace knowledge memory, then translation memory examples.",
    "When a current target draft is provided, improve it when needed instead of repeating it unchanged.",
    "Return concise reasoning that explains terminology, tone, or product-fit choices.",
    "",
    `Project name: ${input.projectName}`,
    `Project translation context: ${input.projectTranslationContext || "(none)"}`,
    `Workspace knowledge memory: ${knowledgeMemory || "(none)"}`,
    glossaryTerms.length > 0
      ? [
          "Glossary terms:",
          ...glossaryTerms.map((term) =>
            [
              `- ${term.sourceTerm} -> ${term.targetTerm} (${term.targetLocale})`,
              term.forbidden ? "forbidden" : null,
              term.description ? `note: ${term.description}` : null,
            ]
              .filter(Boolean)
              .join("; "),
          ),
        ].join("\n")
      : "Glossary terms: (none)",
    translationMemoryMatches.length > 0
      ? [
          "Translation memory matches:",
          ...translationMemoryMatches.map(
            (match) => `- ${match.sourceText} -> ${match.targetText} (${match.targetLocale})`,
          ),
        ].join("\n")
      : "Translation memory matches: (none)",
  ];

  return instructions.join("\n");
}

function buildCatRecommendationPrompt(input: CatAiRecommendationInput) {
  const sections = [
    `Project file: ${input.filename}`,
    `Source path: ${input.sourcePath}`,
    `String key: ${input.key}`,
    `Source locale: ${input.sourceLocale}`,
    `Target locale: ${input.targetLocale}`,
    `File context: ${input.context?.trim() || "(none)"}`,
    `Repository context: ${input.agentContext?.trim() || "(none)"}`,
  ];

  if (input.maxLength) {
    sections.push(`Maximum length: ${input.maxLength} characters`);
  }

  if (input.targetText?.trim()) {
    sections.push("Current target draft:", input.targetText);
  }

  sections.push("Source text:", input.sourceText);

  return sections.join("\n\n");
}

async function generateCatAiRecommendationWithModel(
  model: LanguageModel,
  input: CatAiRecommendationInput,
  context: {
    projectName: string;
    projectTranslationContext: string;
    knowledgeMemory?: string;
    glossaryTerms: Array<{
      sourceTerm: string;
      targetTerm: string;
      targetLocale: string;
      forbidden?: boolean | null;
      description?: string | null;
    }>;
    translationMemoryMatches: Array<{
      sourceText: string;
      targetText: string;
      targetLocale: string;
    }>;
  },
): Promise<CatAiRecommendationResult> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: catAiRecommendationOutputSchema,
    }),
    system: buildCatRecommendationSystemPrompt({
      projectName: context.projectName,
      projectTranslationContext: context.projectTranslationContext,
      knowledgeMemory: context.knowledgeMemory,
      glossaryTerms: context.glossaryTerms,
      translationMemoryMatches: context.translationMemoryMatches,
    }),
    prompt: buildCatRecommendationPrompt(input),
    temperature: 0,
    maxOutputTokens: estimateCatRecommendationMaxOutputTokens(input),
  });

  if (input.maxLength && output.suggestion.length > input.maxLength) {
    throw new Error(`recommendation exceeds maxLength of ${input.maxLength}`);
  }

  return {
    aiSuggestion: output.suggestion,
    aiReasoning: output.reasoning,
  };
}

export async function generateCatAiRecommendation(
  input: CatAiRecommendationInput,
): Promise<Result<CatAiRecommendationResult, CatAiRecommendationError>> {
  const modelResult = await loadOrganizationTranslationModel(input.projectId);
  if (!modelResult.ok) {
    return err({
      code: modelResult.code,
      message: modelResult.message,
    });
  }

  const contextResult = await assembleStringTranslationContextSnapshot(
    input.projectId,
    {
      sourceLocale: input.sourceLocale,
      targetLocales: [input.targetLocale],
      sourceText: input.sourceText,
      context: input.context ?? undefined,
      maxLength: input.maxLength,
      metadata: {
        sourcePath: input.sourcePath,
        key: input.key,
      },
    },
    undefined,
    {
      organizationId: input.organizationId,
    },
  );

  if (!contextResult.ok) {
    return err({
      code: "translation_context_assembly_failed",
      message: contextResult.message,
    });
  }

  try {
    const recommendation = await generateCatAiRecommendationWithModel(modelResult.model, input, {
      projectName: contextResult.snapshot.project.name,
      projectTranslationContext: contextResult.snapshot.project.translationContext,
      knowledgeMemory: contextResult.snapshot.knowledgeMemory,
      glossaryTerms: contextResult.snapshot.glossaryTerms,
      translationMemoryMatches: contextResult.snapshot.translationMemoryMatches,
    });

    return ok(recommendation);
  } catch (error) {
    return err({
      code: "ai_recommendation_failed",
      message:
        error instanceof Error ? error.message : "Failed to generate AI translation recommendation",
    });
  }
}
