import "dotenv/config";

import { describe, expect, it, vi } from "vite-plus/test";

import { createEmailRequestInterpreter } from "./intent";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    generateText: generateTextMock,
  };
});

describe("createEmailRequestInterpreter", () => {
  it("normalizes locales and instructions from structured model output", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        sourceLocale: "en_us",
        targetLocale: "pt_br",
        instructions: " Use informal product marketing copy. ",
        confidence: 0.96,
        missingFields: [],
      },
    });

    const interpretEmailRequest = createEmailRequestInterpreter({
      model: {} as Parameters<typeof createEmailRequestInterpreter>[0]["model"],
    });

    await expect(
      interpretEmailRequest({
        subject: "Please translate",
        text: "Can you translate this from English US to Brazilian Portuguese? Keep it casual.",
      }),
    ).resolves.toEqual({
      sourceLocale: "en-US",
      targetLocale: "pt-BR",
      instructions: "Use informal product marketing copy.",
      confidence: 0.96,
      missingFields: [],
    });
  });

  it("marks absent locales as missing after normalization", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        sourceLocale: null,
        targetLocale: "fr",
        instructions: "",
        confidence: 0.7,
        missingFields: [],
      },
    });

    const interpretEmailRequest = createEmailRequestInterpreter({
      model: {} as Parameters<typeof createEmailRequestInterpreter>[0]["model"],
    });

    await expect(
      interpretEmailRequest({
        subject: "Translate to French",
        text: "Please make this formal.",
      }),
    ).resolves.toEqual({
      sourceLocale: null,
      targetLocale: "fr",
      instructions: null,
      confidence: 0.7,
      missingFields: ["sourceLocale"],
    });
  });
});
