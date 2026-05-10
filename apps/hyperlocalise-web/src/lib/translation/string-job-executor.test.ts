import "dotenv/config";

import { MockLanguageModelV3, mockId, mockValues } from "ai/test";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
});

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
  it("puts binding context and terminology in the system prompt", async () => {
    const doGenerate = vi.fn(async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            translations: [
              { locale: "fr-FR", text: "Bonjour le monde" },
              { locale: "de-DE", text: "Hallo Welt" },
            ],
          }),
        },
      ],
      finishReason: { unified: "stop" as const, raw: undefined },
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
        body: JSON.stringify({ id: "prompt-capture" }),
      },
    }));
    const translateStringJob = createStringTranslationGenerator({
      model: new MockLanguageModelV3({ doGenerate }),
    });

    await translateStringJob(
      createInput({
        projectTranslationContext: "Use concise product-marketing language.",
        contextSnapshot: {
          glossaryTerms: [
            {
              sourceTerm: "workspace",
              targetTerm: "espace de travail",
              targetLocale: "fr-FR",
              description: "Use the product term.",
            },
          ],
          translationMemoryMatches: [
            {
              sourceText: "Hello workspace",
              targetText: "Bonjour espace de travail",
              targetLocale: "fr-FR",
            },
          ],
        },
      }),
    );

    const [[generateOptions]] = doGenerate.mock.calls as unknown as [
      [{ prompt?: Array<{ role?: string; content?: unknown }> }],
    ];
    const systemMessage = generateOptions.prompt?.find((message) => message.role === "system");
    const systemContent = JSON.stringify(systemMessage?.content);
    expect(systemContent).toContain("Use concise product-marketing language.");
    expect(systemContent).toContain("workspace");
    expect(systemContent).toContain("espace de travail");
    expect(systemContent).toContain("Hello workspace");
  });

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

  it("preserves leading and trailing whitespace in translation text", async () => {
    const translateStringJob = createStringTranslationGenerator({
      model: createMockStructuredModel({
        translations: [
          { locale: "fr-FR", text: " Bonjour le monde " },
          { locale: "de-DE", text: "\tHallo Welt\n" },
        ],
      }),
    });

    const result = await translateStringJob(createInput());

    expect(result).toEqual({
      translations: [
        { locale: "fr-FR", text: " Bonjour le monde " },
        { locale: "de-DE", text: "\tHallo Welt\n" },
      ],
    });
  });

  it("deduplicates repeated target locales", async () => {
    const translateStringJob = createStringTranslationGenerator({
      model: createMockStructuredModel({
        translations: [{ locale: "fr-FR", text: "Bonjour le monde" }],
      }),
    });

    const result = await translateStringJob(
      createInput({
        jobInput: {
          sourceText: "Hello world",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR", "fr-FR"],
        },
      }),
    );

    expect(result).toEqual({
      translations: [{ locale: "fr-FR", text: "Bonjour le monde" }],
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
