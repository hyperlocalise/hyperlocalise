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
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/agent-runtime/loops/model", () => ({
  getHyperlocaliseAgentModel: () => "test-model",
}));

import { effectiveEstimationThreshold } from "./quality-domains";
import {
  buildQualityEstimatePrompt,
  estimateQualityBatch,
  isEstimableSegment,
  planQualityEstimateBatches,
  QE_BATCH_SIZE,
  QE_MAX_SEGMENT_RUNES,
  qualityEstimateFindingMessage,
  type QeGenerate,
} from "./quality-estimation";

const segments = [
  { id: "a", sourceText: "Save", targetText: "Speichern" },
  { id: "b", sourceText: "Take 2 tablets daily", targetText: "Nehmen Sie täglich 3 Tabletten" },
];

describe("estimateQualityBatch", () => {
  it("clamps scores, trims reasons and drops ids it did not ask for", async () => {
    const generate: QeGenerate = vi.fn(async () => ({
      segments: [
        { id: "a", score: 104.6, reason: "  No issues found. " },
        { id: "b", score: 12.4, reason: "Dosage changed from 2 to 3." },
        { id: "b", score: 99, reason: "duplicate" },
        { id: "zzz", score: 50, reason: "not asked" },
      ],
    }));
    const result = await estimateQualityBatch(
      { sourceLocale: "en-US", targetLocale: "de-DE", domain: "medical", segments },
      { generate },
    );

    expect(result.ok).toBe(true);
    const estimates = result.ok ? result.value : new Map();
    expect(Object.fromEntries(estimates)).toEqual({
      a: { score: 100, reason: "No issues found." },
      b: { score: 12, reason: "Dosage changed from 2 to 3." },
    });
  });

  it("retries once, then reports a failure", async () => {
    const generate = vi.fn<QeGenerate>(async () => {
      throw new Error("model down");
    });
    const result = await estimateQualityBatch(
      { sourceLocale: "en-US", targetLocale: "de-DE", domain: "general", segments },
      { generate },
    );

    expect(result.ok).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not call the model for an empty batch", async () => {
    const generate = vi.fn<QeGenerate>();
    const result = await estimateQualityBatch(
      { sourceLocale: "en-US", targetLocale: "de-DE", domain: "general", segments: [] },
      { generate },
    );
    expect(result.ok).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("buildQualityEstimatePrompt", () => {
  it("adds the domain's guidance only for regulated domains", () => {
    const general = buildQualityEstimatePrompt({
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      domain: "general",
      segments,
    });
    const medical = buildQualityEstimatePrompt({
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      domain: "medical",
      segments,
    });
    expect(general).not.toContain("dosage");
    expect(medical).toContain("dosage");
    expect(medical).toContain('"translation":"Nehmen Sie täglich 3 Tabletten"');
  });
});

describe("planQualityEstimateBatches", () => {
  it("keeps each call to one locale and at most the batch size", () => {
    const many = Array.from({ length: QE_BATCH_SIZE + 3 }, (_, index) => ({
      id: String(index),
      sourceText: "Hi",
      targetText: "Salut",
      targetLocale: index % 2 === 0 ? "fr-FR" : "de-DE",
    }));
    const batches = planQualityEstimateBatches(many);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(QE_BATCH_SIZE);
      expect(new Set(batch.map((segment) => segment.targetLocale)).size).toBe(1);
    }
    expect(batches.flat()).toHaveLength(many.length);
  });
});

describe("isEstimableSegment", () => {
  it("skips empty and oversized translations", () => {
    expect(isEstimableSegment({ sourceText: "Hi", targetText: "Salut" })).toBe(true);
    expect(isEstimableSegment({ sourceText: "Hi", targetText: "  " })).toBe(false);
    expect(
      isEstimableSegment({ sourceText: "x".repeat(QE_MAX_SEGMENT_RUNES), targetText: "y" }),
    ).toBe(false);
  });
});

describe("effectiveEstimationThreshold", () => {
  it("raises the project's threshold to the domain's floor", () => {
    expect(effectiveEstimationThreshold({ estimationThreshold: 70, domain: "general" })).toBe(70);
    expect(effectiveEstimationThreshold({ estimationThreshold: 70, domain: "legal" })).toBe(85);
    expect(effectiveEstimationThreshold({ estimationThreshold: 90, domain: "financial" })).toBe(90);
  });
});

describe("qualityEstimateFindingMessage", () => {
  it("names the score, threshold and reason", () => {
    expect(qualityEstimateFindingMessage({ score: 42, reason: "Wrong number." }, 70)).toBe(
      "Estimated quality 42/100, below the threshold of 70. Wrong number.",
    );
  });
});
