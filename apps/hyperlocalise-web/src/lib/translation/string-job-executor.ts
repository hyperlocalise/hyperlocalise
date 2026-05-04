import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import type { StringTranslationJobInput } from "@/api/routes/project/job.schema";
import { env } from "@/lib/env";

/**
 * Structured model output for v1 string translation jobs.
 *
 * Later work should add richer per-locale diagnostics here once review and QA
 * checks are part of the job lifecycle. Good candidates are glossary matches,
 * max-length repair attempts, provider usage, and model warnings.
 */
const stringTranslationOutputSchema = z.object({
  translations: z.array(
    z.object({
      locale: z.string().trim().min(1),
      text: z.string().trim().min(1),
    }),
  ),
});

export type StringTranslationJobResult = z.infer<typeof stringTranslationOutputSchema>;

export type StringTranslationGeneratorInput = {
  projectName: string;
  projectTranslationContext: string;
  jobInput: StringTranslationJobInput;
  contextSnapshot?: {
    glossaryTerms?: Array<{
      sourceTerm: string;
      targetTerm: string;
      targetLocale: string;
      forbidden?: boolean | null;
      description?: string | null;
    }>;
    translationMemoryMatches?: Array<{
      sourceText: string;
      targetText: string;
      targetLocale: string;
      provenance?: string | null;
      rank?: number;
    }>;
  };
};

export type StringTranslationGenerator = (
  input: StringTranslationGeneratorInput,
) => Promise<StringTranslationJobResult>;

type CreateStringTranslationGeneratorOptions = {
  model: LanguageModel;
};

/**
 * Builds the legacy app-level OpenAI model.
 *
 * New production workflow execution should prefer
 * `createOpenAIStringTranslationGenerator()` so each organization uses its
 * own encrypted provider credential and configured default model.
 */
function getDefaultTranslationModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return openai("gpt-5.4-mini");
}

/**
 * Builds stable system instructions for deterministic string translation.
 *
 * Future improvements should pull in attached project glossaries, translation
 * memory examples, brand voice rules, and file-format-specific preservation
 * rules. Keep those additions structured and bounded so prompts stay auditable.
 */
function buildSystemPrompt(input: StringTranslationGeneratorInput) {
  const instructions = [
    "You are an expert software localization engine.",
    "Translate the provided source text into every requested target locale.",
    "Preserve meaning, tone, placeholders, HTML, Markdown, punctuation, whitespace, and line breaks.",
    "Do not explain your work.",
    "Return one translation for each requested locale.",
  ];

  if (input.jobInput.maxLength) {
    instructions.push(
      `Each translated string must be at most ${input.jobInput.maxLength} characters long.`,
    );
  }

  return instructions.join("\n");
}

/**
 * Builds the user prompt with project and job-specific context.
 *
 * Later work should replace the raw metadata JSON blob with a typed prompt
 * section once clients start sending stable metadata keys. That will make
 * prompt changes easier to review and test.
 */
function buildPrompt(input: StringTranslationGeneratorInput) {
  const glossaryTerms = input.contextSnapshot?.glossaryTerms ?? [];
  const translationMemoryMatches = input.contextSnapshot?.translationMemoryMatches ?? [];

  return [
    `Project: ${input.projectName}`,
    `Source locale: ${input.jobInput.sourceLocale}`,
    `Target locales: ${input.jobInput.targetLocales.join(", ")}`,
    `Project translation context: ${input.projectTranslationContext || "(none)"}`,
    `Job context: ${input.jobInput.context || "(none)"}`,
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
    `Metadata: ${JSON.stringify(input.jobInput.metadata ?? {})}`,
    "Source text:",
    input.jobInput.sourceText,
  ].join("\n\n");
}

/**
 * Validates and normalizes model output into the requested target-locale order.
 *
 * This is intentionally strict: job persistence should only store complete
 * results. Future repair logic can live before this function or in a retry step
 * that asks the model to fix a specific schema/locale/length problem.
 */
function normalizeTranslations(
  jobInput: StringTranslationJobInput,
  result: StringTranslationJobResult,
): StringTranslationJobResult {
  const translationsByLocale = new Map<string, string>();

  for (const translation of result.translations) {
    if (translationsByLocale.has(translation.locale)) {
      throw new Error(`duplicate translation returned for locale ${translation.locale}`);
    }

    translationsByLocale.set(translation.locale, translation.text);
  }

  for (const locale of new Set(jobInput.targetLocales)) {
    if (!translationsByLocale.has(locale)) {
      throw new Error(`missing translation for locale ${locale}`);
    }
  }

  for (const locale of translationsByLocale.keys()) {
    if (!jobInput.targetLocales.includes(locale)) {
      throw new Error(`unexpected translation locale ${locale}`);
    }
  }

  const translations = [...new Set(jobInput.targetLocales)].map((locale) => {
    const text = translationsByLocale.get(locale);

    if (!text) {
      throw new Error(`missing translation for locale ${locale}`);
    }

    if (jobInput.maxLength && text.length > jobInput.maxLength) {
      throw new Error(`translation for locale ${locale} exceeds maxLength`);
    }

    return { locale, text };
  });

  return { translations };
}

/**
 * Creates a string translation generator around any AI SDK language model.
 *
 * The returned generator executes one v1 string-translation job and returns a
 * normalized per-locale payload ready to persist as `string_result`.
 */
export function createStringTranslationGenerator({
  model,
}: CreateStringTranslationGeneratorOptions): StringTranslationGenerator {
  return async (input) => {
    const { output } = await generateText({
      model,
      output: Output.object({
        schema: stringTranslationOutputSchema,
      }),
      system: buildSystemPrompt(input),
      prompt: buildPrompt(input),
      temperature: 0,
    });

    return normalizeTranslations(input.jobInput, output);
  };
}

/**
 * Executes string translation with the app-level OpenAI API key.
 *
 * This remains useful for local development and focused unit tests, but the
 * durable translation job workflow should use organization-scoped credentials.
 */
export const translateStringJobWithOpenAI: StringTranslationGenerator = async (input) => {
  const translateStringJob = createStringTranslationGenerator({
    model: getDefaultTranslationModel(),
  });

  return translateStringJob(input);
};

/**
 * Creates a string translation generator backed by an organization OpenAI key.
 *
 * Later provider work should add sibling factories for Anthropic, Gemini, Groq,
 * and Mistral rather than expanding this OpenAI-specific factory. That keeps
 * provider differences isolated from prompt and normalization logic.
 */
export function createOpenAIStringTranslationGenerator(input: {
  apiKey: string;
  model: string;
}): StringTranslationGenerator {
  const provider = createOpenAI({
    apiKey: input.apiKey,
  });

  return createStringTranslationGenerator({
    model: provider(input.model),
  });
}
