import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import type { StringTranslationJobInput } from "@/api/routes/project/translation-job.schema";
import { env } from "@/lib/env";

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
};

export type StringTranslationGenerator = (
  input: StringTranslationGeneratorInput,
) => Promise<StringTranslationJobResult>;

type CreateStringTranslationGeneratorOptions = {
  model: LanguageModel;
};

function getDefaultTranslationModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return openai("gpt-5.4-mini");
}

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

function buildPrompt(input: StringTranslationGeneratorInput) {
  return [
    `Project: ${input.projectName}`,
    `Source locale: ${input.jobInput.sourceLocale}`,
    `Target locales: ${input.jobInput.targetLocales.join(", ")}`,
    `Project translation context: ${input.projectTranslationContext || "(none)"}`,
    `Job context: ${input.jobInput.context || "(none)"}`,
    `Metadata: ${JSON.stringify(input.jobInput.metadata ?? {})}`,
    "Source text:",
    input.jobInput.sourceText,
  ].join("\n\n");
}

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

  const translations = jobInput.targetLocales.map((locale) => {
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
 * Executes the v1 string-translation job against OpenAI and returns a
 * normalized per-locale result payload ready to persist as `string_result`.
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

export const translateStringJobWithOpenAI: StringTranslationGenerator = async (input) => {
  const translateStringJob = createStringTranslationGenerator({
    model: getDefaultTranslationModel(),
  });

  return translateStringJob(input);
};

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
