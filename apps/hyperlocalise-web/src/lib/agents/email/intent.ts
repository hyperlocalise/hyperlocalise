import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import { env } from "@/lib/env";
import type { EmailAgentIntentKind } from "./types";

const emailRequestIntentSchema = z.object({
  kind: z.enum(["translate", "check", "keyword_research", "unknown"]).default("translate"),
  sourceLocale: z.string().trim().nullable(),
  targetLocale: z.string().trim().nullable(),
  instructions: z.string().trim().nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.enum(["sourceLocale", "targetLocale"])),
});

export type EmailRequestIntent = z.infer<typeof emailRequestIntentSchema>;

type CreateEmailRequestInterpreterOptions = {
  model: LanguageModel;
};

function getEmailIntentModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  return provider("gpt-5.4-mini");
}

export function normalizeLocale(locale: string | null) {
  const value = locale?.trim().replaceAll("_", "-");
  if (!value) {
    return null;
  }

  try {
    return new Intl.Locale(value).toString();
  } catch {
    return value.toLowerCase();
  }
}

function normalizeInstructions(instructions: string | null) {
  const value = instructions?.trim();
  return value ? value : null;
}

function normalizeEmailRequestIntent(intent: EmailRequestIntent): EmailRequestIntent {
  const sourceLocale = normalizeLocale(intent.sourceLocale);
  const targetLocale = normalizeLocale(intent.targetLocale);
  const missingFields = new Set(intent.missingFields);

  if (!sourceLocale) {
    missingFields.add("sourceLocale");
  } else {
    missingFields.delete("sourceLocale");
  }

  if (!targetLocale) {
    missingFields.add("targetLocale");
  } else {
    missingFields.delete("targetLocale");
  }

  return {
    kind: (intent.kind ?? "translate") as EmailAgentIntentKind,
    sourceLocale,
    targetLocale,
    instructions: normalizeInstructions(intent.instructions),
    confidence: intent.confidence,
    missingFields: [...missingFields] as EmailRequestIntent["missingFields"],
  };
}

function buildIntentPrompt(input: { subject: string; text: string }) {
  return [
    "Classify the user's email-agent request and extract the actionable fields.",
    'Set kind to "translate" when the user asks to translate or localize files/images.',
    'Set kind to "check" when the user asks to validate, review, inspect, QA, or find localization issues.',
    'Set kind to "keyword_research" when the user asks for localized keyword, SEO keyword, search demand, or market query research.',
    'Set kind to "unknown" when the request is not a localization-agent task.',
    "For translate/localize requests, return the source locale and target locale as BCP 47 locale tags when they are present.",
    "Infer common language names and regions, such as English to en, Vietnamese to vi, Brazilian Portuguese to pt-BR, and French Canada to fr-CA.",
    'Treat phrases like "from English into Vietnamese", "from English to Vietnamese", and "English to Vietnamese" as explicit source and target locales.',
    "Only set a locale when the email clearly asks for it. Do not guess from the sender, attachment name, or signature.",
    "Put translation preferences in instructions, such as tone, formality, audience, terminology, or style constraints.",
    "Do not include attachment handling, greetings, or unrelated email text in instructions.",
    "",
    `Subject: ${input.subject || "(none)"}`,
    "",
    "Body:",
    input.text || "(none)",
  ].join("\n");
}

export function createEmailRequestInterpreter({ model }: CreateEmailRequestInterpreterOptions) {
  return async (input: { subject: string; text: string }) => {
    const { output } = await generateText({
      model,
      output: Output.object({
        schema: emailRequestIntentSchema,
      }),
      system:
        "You are a precise email intake parser for a localization agent. Return only structured data.",
      prompt: buildIntentPrompt(input),
      temperature: 0,
    });

    return normalizeEmailRequestIntent(output);
  };
}

function buildClarificationPrompt(input: { text: string }) {
  return [
    "The user is replying to a request for missing translation locale information.",
    "Extract any source locale and target locale they mention.",
    'Keep kind as "translate" for clarification replies unless the user clearly changes the task.',
    "Return the locales as BCP 47 locale tags when they are present.",
    "Infer common language names and regions, such as English to en, Vietnamese to vi-VN, Brazilian Portuguese to pt-BR, and French Canada to fr-CA.",
    "If the user only mentions one language, assume it is the target locale unless they explicitly label it as source.",
    "Put translation preferences in instructions, such as tone, formality, audience, terminology, or style constraints.",
    "",
    "User reply:",
    input.text || "(none)",
  ].join("\n");
}

export function createClarificationInterpreter({ model }: CreateEmailRequestInterpreterOptions) {
  return async (input: { text: string }) => {
    const { output } = await generateText({
      model,
      output: Output.object({
        schema: emailRequestIntentSchema,
      }),
      system:
        "You are a precise email intake parser for a localization agent. This is a clarification reply. Return only structured data.",
      prompt: buildClarificationPrompt(input),
      temperature: 0,
    });

    return normalizeEmailRequestIntent(output);
  };
}

export async function interpretEmailRequest(input: {
  subject: string;
  text: string;
}): Promise<EmailRequestIntent> {
  const interpret = createEmailRequestInterpreter({
    model: getEmailIntentModel(),
  });

  return interpret(input);
}

export async function interpretClarificationReply(input: {
  text: string;
}): Promise<EmailRequestIntent> {
  const interpret = createClarificationInterpreter({
    model: getEmailIntentModel(),
  });

  return interpret(input);
}
