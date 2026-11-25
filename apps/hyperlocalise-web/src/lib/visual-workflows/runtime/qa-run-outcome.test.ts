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
import { describe, expect, it } from "vite-plus/test";

import { computeQaQuality, DEFAULT_QA_SCORING_POLICY } from "@/lib/qa/qa-scoring";
import type { TranslationQaEstimationSummary } from "@/lib/qa/types";

import { qaRunOutcome } from "./localization-actions";

describe("qaRunOutcome", () => {
  it("fails on any error when the project does not score translations", () => {
    expect(qaRunOutcome({ errorCount: 0 })).toEqual({
      passed: true,
      qualityScore: null,
      qualityThreshold: null,
      qualityByLocale: null,
      estimatedQualityScore: null,
      reviewSegmentCount: 0,
      needsHumanReview: false,
      reviewReasons: [],
    });
    expect(qaRunOutcome({ errorCount: 2 }).passed).toBe(false);
  });

  it("passes on the score even with errors when every language reaches the threshold", () => {
    const quality = computeQaQuality({
      policy: { ...DEFAULT_QA_SCORING_POLICY, enabled: true, passThreshold: 95 },
      wordCountByLocale: { "de-DE": 500 },
      findings: [{ checkType: "length", severity: "error", targetLocale: "de-DE" }],
    });

    expect(qaRunOutcome({ errorCount: 1, quality })).toMatchObject({
      passed: true,
      qualityScore: 99,
      qualityThreshold: 95,
      qualityByLocale: { "de-DE": { score: 99, passed: true } },
      needsHumanReview: false,
    });
  });

  it("fails when a language falls below the threshold", () => {
    const quality = computeQaQuality({
      policy: { ...DEFAULT_QA_SCORING_POLICY, enabled: true, passThreshold: 99.5 },
      wordCountByLocale: { "de-DE": 500, "fr-FR": 500 },
      findings: [{ checkType: "length", severity: "error", targetLocale: "fr-FR" }],
    });

    expect(qaRunOutcome({ errorCount: 1, quality })).toMatchObject({
      passed: false,
      qualityByLocale: {
        "de-DE": { passed: true },
        "fr-FR": { score: 99, passed: false },
      },
    });
  });

  const estimation: TranslationQaEstimationSummary = {
    threshold: 70,
    domain: "general",
    segmentCount: 10,
    estimatedCount: 10,
    averageScore: 84.5,
    belowThresholdCount: 2,
    byLocale: {},
  };

  it("asks for review when the estimate flags segments", () => {
    expect(qaRunOutcome({ errorCount: 0, estimation })).toMatchObject({
      passed: true,
      estimatedQualityScore: 84.5,
      reviewSegmentCount: 2,
      needsHumanReview: true,
      reviewReasons: ["low_estimated_quality"],
    });
    expect(
      qaRunOutcome({ errorCount: 0, estimation: { ...estimation, belowThresholdCount: 0 } }),
    ).toMatchObject({ needsHumanReview: false, reviewReasons: [] });
  });

  it("always asks for review in a regulated domain, and lists every reason", () => {
    expect(qaRunOutcome({ errorCount: 0, domain: "medical" })).toMatchObject({
      passed: true,
      needsHumanReview: true,
      reviewReasons: ["domain_requires_review"],
    });
    expect(qaRunOutcome({ errorCount: 1, estimation, domain: "legal" }).reviewReasons).toEqual([
      "domain_requires_review",
      "qa_failed",
      "low_estimated_quality",
    ]);
    expect(qaRunOutcome({ errorCount: 0, domain: "general" }).needsHumanReview).toBe(false);
  });
});
