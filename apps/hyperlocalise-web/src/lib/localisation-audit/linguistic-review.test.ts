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

import { runLinguisticLocalisationReview } from "./linguistic-review";
import type { LocalisationAuditCrawledPage } from "./types";

function page(
  partial: Partial<LocalisationAuditCrawledPage> & { url: string },
): LocalisationAuditCrawledPage {
  return {
    status: 200,
    htmlLang: null,
    title: null,
    textSample: "",
    hreflang: [],
    ...partial,
  };
}

const longSample =
  "Cette phrase est suffisamment longue pour passer le filtre d'echantillonnage linguistique.";

describe("runLinguisticLocalisationReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.OPENAI_API_KEY = "test-openai-api-key";
  });

  it("returns empty results when focus locales are blank or missing", async () => {
    await expect(
      runLinguisticLocalisationReview({
        focusLocales: ["  ", ""],
        pages: [page({ url: "https://example.com/fr", textSample: longSample })],
      }),
    ).resolves.toEqual({ findings: [], linguisticNotes: [] });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("returns empty results when OPENAI_API_KEY is unset", async () => {
    envState.OPENAI_API_KEY = undefined;

    await expect(
      runLinguisticLocalisationReview({
        focusLocales: ["fr"],
        pages: [page({ url: "https://example.com/fr", textSample: longSample })],
      }),
    ).resolves.toEqual({ findings: [], linguisticNotes: [] });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("skips the model when no usable text samples can be extracted", async () => {
    await expect(
      runLinguisticLocalisationReview({
        focusLocales: ["fr"],
        pages: [
          page({
            url: "https://example.com/fr",
            htmlLang: "fr",
            textSample: "Trop court.",
          }),
        ],
      }),
    ).resolves.toEqual({ findings: [], linguisticNotes: [] });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("caps focus locales, findings, and samples from model output", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        notes: [
          {
            locale: "fr",
            summary: "French copy needs polish",
            samples: Array.from({ length: 7 }, (_, index) => ({
              text: `sample-${index}`,
              note: `note-${index}`,
            })),
            findings: [
              {
                severity: "critical",
                title: "Mixed language CTA",
                summary: "CTA mixes English and French",
                evidence: "Buy now",
                url: "https://example.com/fr",
              },
              {
                severity: "warning",
                title: "Literal translation",
                summary: "Awkward phrasing",
              },
              {
                severity: "info",
                title: "Tone drift",
                summary: "Tone feels inconsistent",
              },
              {
                severity: "info",
                title: "Should be dropped",
                summary: "Fourth finding exceeds the per-locale cap",
              },
            ],
          },
        ],
      },
    });

    const result = await runLinguisticLocalisationReview({
      focusLocales: ["fr", "de", "es"],
      pages: [
        page({
          url: "https://example.com/fr/pricing",
          htmlLang: "fr",
          textSample: `${longSample} Suite de contenu pour le marche francophone.`,
        }),
        page({
          url: "https://example.com/de/pricing",
          htmlLang: "de",
          textSample: "Dieser Satz ist lang genug fuer die deutsche Stichprobe und den Filter.",
        }),
      ],
    });

    expect(generateTextMock).toHaveBeenCalledOnce();
    const prompt = String(generateTextMock.mock.calls[0]?.[0]?.prompt ?? "");
    expect(prompt).toContain('"locale":"fr"');
    expect(prompt).toContain('"locale":"de"');
    expect(prompt).not.toContain('"locale":"es"');

    expect(result.linguisticNotes).toHaveLength(1);
    expect(result.linguisticNotes[0]?.samples).toHaveLength(5);
    expect(result.findings).toHaveLength(3);
    expect(result.findings.map((finding) => finding.id)).toEqual(["ling-0", "ling-1", "ling-2"]);
    expect(result.findings.every((finding) => finding.category === "linguistic")).toBe(true);
    expect(result.findings.some((finding) => finding.title === "Should be dropped")).toBe(false);
  });

  it("fail-closes to empty results when the model call throws", async () => {
    generateTextMock.mockRejectedValue(new Error("model unavailable"));

    await expect(
      runLinguisticLocalisationReview({
        focusLocales: ["fr"],
        pages: [
          page({
            url: "https://example.com/fr",
            htmlLang: "fr",
            textSample: longSample,
          }),
        ],
      }),
    ).resolves.toEqual({ findings: [], linguisticNotes: [] });
  });
});
