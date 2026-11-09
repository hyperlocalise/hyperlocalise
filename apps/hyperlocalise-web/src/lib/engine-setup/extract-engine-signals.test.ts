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
import { generateText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { extractEngineSignals } from "./extract-engine-signals";
import type { EnginePageCorpus } from "./page-corpus";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn((input) => input) },
}));

vi.mock("@/lib/agent-runtime/loops/model", () => ({
  getHyperlocaliseAgentModel: () => "test-model",
}));

const corpus: EnginePageCorpus = {
  index: 0,
  url: "https://acme.test/",
  title: "Acme Flow",
  description: "Ship translations faster",
  headings: ["Acme Flow"],
  buttons: ["Start trial"],
  text: "Acme Flow helps teams ship translations.",
};

const termOutput = {
  terms: [
    {
      term: "Acme Flow",
      termType: "product" as const,
      translatable: false,
      definition: "The localisation product.",
      confidence: 90,
      evidence: [{ pageIndex: 0, snippet: "Acme Flow helps teams ship translations." }],
    },
  ],
};

const guidelineOutput = {
  voice: {
    summary: "Direct and product-led.",
    formality: 40,
    playfulness: 20,
    technicality: 50,
    doSay: ["ship translations"],
    dontSay: ["leverage"],
    confidence: 80,
    evidence: [{ pageIndex: 0, snippet: "Ship translations faster" }],
  },
  rules: [
    {
      text: "Address the reader as you",
      category: "tone" as const,
      confidence: 70,
      evidence: [{ pageIndex: 0, snippet: "helps teams" }],
    },
  ],
};

describe("extractEngineSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty candidates without calling the model", async () => {
    await expect(extractEngineSignals([])).resolves.toEqual({
      ok: true,
      value: { terms: [], rules: [], voice: null },
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("keeps guideline candidates when term extraction fails", async () => {
    vi.mocked(generateText).mockImplementation(async (input) => {
      if (typeof input.prompt === "string" && input.prompt.includes("Extract glossary terms")) {
        throw new Error("terms down");
      }
      return { output: guidelineOutput } as never;
    });

    await expect(extractEngineSignals([corpus])).resolves.toEqual({
      ok: true,
      value: {
        terms: [],
        rules: guidelineOutput.rules,
        voice: guidelineOutput.voice,
      },
    });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("fails only when both model calls reject", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("gateway down"));

    await expect(extractEngineSignals([corpus])).resolves.toEqual({
      ok: false,
      error: { code: "extraction_failed" },
    });
  });

  it("returns terms and guidelines together on a full success", async () => {
    vi.mocked(generateText).mockImplementation(async (input) => {
      if (typeof input.prompt === "string" && input.prompt.includes("Extract glossary terms")) {
        return { output: termOutput } as never;
      }
      return { output: guidelineOutput } as never;
    });

    await expect(extractEngineSignals([corpus])).resolves.toEqual({
      ok: true,
      value: {
        terms: termOutput.terms,
        rules: guidelineOutput.rules,
        voice: guidelineOutput.voice,
      },
    });
  });
});
