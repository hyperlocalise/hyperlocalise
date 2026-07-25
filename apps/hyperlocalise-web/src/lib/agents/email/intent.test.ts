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
import "dotenv/config";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createClarificationInterpreter, createEmailRequestInterpreter } from "./intent";

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

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-api-key",
  },
}));

function expectGenerateTextUsesInstructions(expectedInstructions: string) {
  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      instructions: expect.stringContaining(expectedInstructions),
    }),
  );
  expect(generateTextMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("system");
}

beforeEach(() => {
  vi.clearAllMocks();
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
      kind: "translate",
      sourceLocale: "en-US",
      targetLocale: "pt-BR",
      instructions: "Use informal product marketing copy.",
      confidence: 0.96,
      missingFields: [],
    });
    expectGenerateTextUsesInstructions("email intake parser");
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
      kind: "translate",
      sourceLocale: null,
      targetLocale: "fr",
      instructions: null,
      confidence: 0.7,
      missingFields: ["sourceLocale"],
    });
  });

  it("prompts the model to parse explicit from-into language requests", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        sourceLocale: "en",
        targetLocale: "vi",
        instructions: null,
        confidence: 0.96,
        missingFields: [],
      },
    });

    const interpretEmailRequest = createEmailRequestInterpreter({
      model: {} as Parameters<typeof createEmailRequestInterpreter>[0]["model"],
    });

    await expect(
      interpretEmailRequest({
        subject: "Translate",
        text: "Can you translate this file from English into Vietnamese",
      }),
    ).resolves.toEqual({
      kind: "translate",
      sourceLocale: "en",
      targetLocale: "vi",
      instructions: null,
      confidence: 0.96,
      missingFields: [],
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Set kind to "translate"'),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'Treat phrases like "from English into Vietnamese", "from English to Vietnamese", and "English to Vietnamese" as explicit source and target locales.',
        ),
      }),
    );
  });

  it("uses AI SDK instructions for clarification replies", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        sourceLocale: "en",
        targetLocale: "fr-ca",
        instructions: "Match the source tone.",
        confidence: 0.91,
        missingFields: [],
      },
    });

    const interpretClarification = createClarificationInterpreter({
      model: {} as Parameters<typeof createClarificationInterpreter>[0]["model"],
    });

    await expect(
      interpretClarification({
        text: "Source is English, target is French Canada. Match the source tone.",
      }),
    ).resolves.toEqual({
      kind: "translate",
      sourceLocale: "en",
      targetLocale: "fr-CA",
      instructions: "Match the source tone.",
      confidence: 0.91,
      missingFields: [],
    });
    expectGenerateTextUsesInstructions("clarification reply");
  });
});
