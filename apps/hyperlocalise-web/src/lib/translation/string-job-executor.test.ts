import "dotenv/config";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
process.env.INNGEST_EVENT_KEY ??= "test-event-key";
process.env.INNGEST_SIGNING_KEY ??= "test-signing-key";

import { describe, expect, it } from "vitest";
import { MockLanguageModelV3, mockId, mockValues } from "ai/test";

import {
  createStringTranslationGenerator,
  type StringTranslationGeneratorInput,
} from "@/lib/translation/string-job-executor";

function createMockStructuredModel(...outputs: unknown[]) {
  const nextId = mockId();
  const nextOutput = mockValues(...outputs);

  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(nextOutput()),
        },
      ],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 20,
          text: 20,
          reasoning: undefined,
        },
      },
      warnings: [],
      request: {
        body: JSON.stringify({ id: nextId() }),
      },
    }),
  });
}

function createInput(overrides: Partial<StringTranslationGeneratorInput> = {}) {
  return {
    projectName: "Docs",
    projectTranslationContext: "UI copy for a documentation product.",
    jobInput: {
      sourceText: "Hello world",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
      context: "Homepage hero title",
      metadata: { key: "hero.title" },
    },
    ...overrides,
  } satisfies StringTranslationGeneratorInput;
}

describe("createStringTranslationGenerator", () => {
  it("returns translations in the requested locale order", async () => {
    const translateStringJob = createStringTranslationGenerator({
      model: createMockStructuredModel({
        translations: [
          { locale: "de-DE", text: "Hallo Welt" },
          { locale: "fr-FR", text: "Bonjour le monde" },
        ],
      }),
    });

    const result = await translateStringJob(createInput());

    expect(result).toEqual({
      translations: [
        { locale: "fr-FR", text: "Bonjour le monde" },
        { locale: "de-DE", text: "Hallo Welt" },
      ],
    });
  });

  it("rejects whitespace-only translation text", async () => {
    const translateStringJob = createStringTranslationGenerator({
      model: createMockStructuredModel({
        translations: [
          { locale: "fr-FR", text: "   " },
          { locale: "de-DE", text: "Hallo Welt" },
        ],
      }),
    });

    await expect(translateStringJob(createInput())).rejects.toThrow();
  });

  it("rejects unexpected locales from the model output", async () => {
    const translateStringJob = createStringTranslationGenerator({
      model: createMockStructuredModel({
        translations: [
          { locale: "fr-FR", text: "Bonjour le monde" },
          { locale: "de-DE", text: "Hallo Welt" },
          { locale: "es-ES", text: "Hola mundo" },
        ],
      }),
    });

    await expect(translateStringJob(createInput())).rejects.toThrow(
      "unexpected translation locale es-ES",
    );
  });
});
