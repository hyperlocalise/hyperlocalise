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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { generateTextMock, envState, getHyperlocaliseAgentModelMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  getHyperlocaliseAgentModelMock: vi.fn(() => ({ modelId: "test-model" })),
  envState: { OPENAI_API_KEY: "test-openai-api-key" as string | undefined },
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("@/lib/env", () => ({
  env: envState,
}));

vi.mock("@/lib/agent-runtime/loops/model", () => ({
  getHyperlocaliseAgentModel: () => getHyperlocaliseAgentModelMock(),
}));

vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { LOCALISATION_AUDIT_CREDITS } from "./catalog";
import { runLocalisationAuditCredits } from "./runner";
import { emptyCrawledPage } from "../types";

describe("runLocalisationAuditCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.OPENAI_API_KEY = "test-openai-api-key";
  });

  it("does not call Luna for credits the heuristic already scored", async () => {
    generateTextMock.mockResolvedValue({ output: { credits: [], notes: [] } });

    const result = await runLocalisationAuditCredits({
      pages: [
        emptyCrawledPage({
          url: "https://example.com/fr/pricing",
          htmlLang: "fr",
          canonical: "https://example.com/en/pricing",
          textSample: "Bienvenue sur notre page tarifs pour les equipes produit en france.",
        }),
        emptyCrawledPage({
          url: "https://example.com/en/pricing",
          htmlLang: "en",
          textSample: "Welcome to our pricing page for growing product teams worldwide today.",
        }),
      ],
      focusLocales: [],
    });

    const canonical = result.credits.find((credit) => credit.id === "canonical-urls");
    expect(canonical?.method).toBe("heuristic");
    expect(canonical?.score).not.toBeNull();

    if (generateTextMock.mock.calls.length > 0) {
      const prompt = String(generateTextMock.mock.calls[0]?.[0]?.prompt ?? "");
      expect(prompt).not.toContain('"id":"canonical-urls"');
    }
  });

  it("batches remaining credits to Luna and marks them N/A when the API key is missing", async () => {
    envState.OPENAI_API_KEY = undefined;

    const result = await runLocalisationAuditCredits({
      pages: [
        emptyCrawledPage({
          url: "https://example.com/fr/pricing",
          htmlLang: "fr",
          buttons: ["Commencer"],
          textSample: "Bienvenue sur notre page tarifs pour les equipes produit en france.",
        }),
        emptyCrawledPage({
          url: "https://example.com/en/pricing",
          htmlLang: "en",
          buttons: ["Get started"],
          textSample: "Welcome to our pricing page for growing product teams worldwide today.",
        }),
      ],
      focusLocales: ["fr"],
    });

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(result.credits.find((credit) => credit.id === "fluency")?.method).toBe("na");
    expect(result.credits.find((credit) => credit.id === "fluency")?.score).toBeNull();
    expect(result.credits.find((credit) => credit.id === "glossary-compliance")?.method).toBe("na");
    expect(result.credits).toHaveLength(LOCALISATION_AUDIT_CREDITS.length);
  });

  it("applies Luna scores when the model returns credit results", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        credits: [
          {
            id: "fluency",
            score: 71,
            confidence: 82,
            findings: [
              {
                severity: "low",
                title: "Awkward phrasing",
                summary: "The French intro sounds slightly machine translated.",
                evidence: "equipes produit",
                url: null,
              },
            ],
          },
        ],
        notes: [
          {
            locale: "fr",
            summary: "Mostly natural with a few literal phrases.",
            samples: [{ text: "Bienvenue sur notre page tarifs", note: "Natural greeting" }],
          },
        ],
      },
    });

    const result = await runLocalisationAuditCredits({
      pages: [
        emptyCrawledPage({
          url: "https://example.com/fr/pricing",
          htmlLang: "fr",
          textSample:
            "Bienvenue sur notre page tarifs pour les equipes produit en france aujourd'hui.",
        }),
        emptyCrawledPage({
          url: "https://example.com/en/pricing",
          htmlLang: "en",
          textSample: "Welcome to our pricing page for growing product teams worldwide today.",
        }),
      ],
      focusLocales: ["fr"],
    });

    expect(generateTextMock).toHaveBeenCalledOnce();
    expect(result.credits.find((credit) => credit.id === "fluency")).toEqual({
      id: "fluency",
      dimension: "linguistic",
      score: 71,
      method: "luna",
    });
    expect(result.findings.some((finding) => finding.title === "Awkward phrasing")).toBe(true);
    expect(result.linguisticNotes).toHaveLength(1);
  });
});
