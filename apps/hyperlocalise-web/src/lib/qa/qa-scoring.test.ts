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

import {
  computeQaQuality,
  countSourceWords,
  DEFAULT_QA_SCORING_POLICY,
  mqmScore,
  QA_CHECK_DIMENSIONS,
  qaFindingPenalty,
  resolveQaScoringPolicy,
  type QaScoringPolicy,
} from "./qa-scoring";
import { translationQaCheckTypes } from "./types";

const policy: QaScoringPolicy = { ...DEFAULT_QA_SCORING_POLICY, enabled: true, passThreshold: 95 };

describe("mqmScore", () => {
  it("normalises penalty points by source words", () => {
    expect(mqmScore(0, 200)).toBe(100);
    expect(mqmScore(5, 200)).toBe(97.5);
    expect(mqmScore(1, 3)).toBe(66.67);
  });

  it("floors at zero", () => {
    expect(mqmScore(50, 10)).toBe(0);
  });

  it("scores text with no words as 100 only without penalties", () => {
    expect(mqmScore(0, 0)).toBe(100);
    expect(mqmScore(1, 0)).toBe(0);
  });
});

describe("qaFindingPenalty", () => {
  it("maps QA severity to MQM severity by default", () => {
    expect(qaFindingPenalty({ checkType: "spelling", severity: "warning" }, policy)).toBe("minor");
    expect(qaFindingPenalty({ checkType: "length", severity: "error" }, policy)).toBe("major");
  });

  it("uses the project's per-check override", () => {
    const withOverride = { ...policy, penalties: { placeholder_mismatch: "critical" as const } };
    expect(
      qaFindingPenalty({ checkType: "placeholder_mismatch", severity: "error" }, withOverride),
    ).toBe("critical");
  });
});

describe("computeQaQuality", () => {
  it("scores each locale and the whole scan", () => {
    const quality = computeQaQuality({
      policy,
      wordCountByLocale: { "de-DE": 100, "fr-FR": 100 },
      findings: [
        { checkType: "glossary_violation", severity: "warning", targetLocale: "de-DE" },
        { checkType: "length", severity: "error", targetLocale: "de-DE" },
      ],
    });

    expect(quality.byLocale["de-DE"]).toEqual({
      score: 94,
      passed: false,
      wordCount: 100,
      penaltyPoints: 6,
      criticalCount: 0,
    });
    expect(quality.byLocale["fr-FR"]).toMatchObject({ score: 100, passed: true });
    expect(quality.score).toBe(97);
    expect(quality.passed).toBe(false);
    expect(quality.penaltyByDimension).toEqual({ terminology: 1, design_and_markup: 5 });
    expect(quality.threshold).toBe(95);
  });

  it("fails a locale with a critical finding even above the threshold", () => {
    const quality = computeQaQuality({
      policy: { ...policy, penalties: { numbers_mismatch: "critical" } },
      wordCountByLocale: { "ja-JP": 10_000 },
      findings: [{ checkType: "numbers_mismatch", severity: "warning", targetLocale: "ja-JP" }],
    });

    expect(quality.byLocale["ja-JP"]).toMatchObject({
      score: 99.75,
      passed: false,
      criticalCount: 1,
    });
    expect(quality.passed).toBe(false);
  });

  it("passes a clean scan", () => {
    const quality = computeQaQuality({
      policy,
      wordCountByLocale: { "es-MX": 40 },
      findings: [],
    });
    expect(quality).toMatchObject({ score: 100, passed: true, penaltyPoints: 0 });
  });
});

describe("resolveQaScoringPolicy", () => {
  it("falls back to scoring off", () => {
    expect(resolveQaScoringPolicy(undefined)).toEqual(DEFAULT_QA_SCORING_POLICY);
    expect(resolveQaScoringPolicy("nope")).toEqual(DEFAULT_QA_SCORING_POLICY);
  });

  it("clamps the threshold and drops unknown penalties", () => {
    expect(
      resolveQaScoringPolicy({
        enabled: true,
        passThreshold: 140,
        penalties: { spelling: "critical", made_up: "minor", length: "huge" },
      }),
    ).toEqual({
      ...DEFAULT_QA_SCORING_POLICY,
      enabled: true,
      passThreshold: 100,
      penalties: { spelling: "critical" },
    });
  });

  it("reads the estimate threshold and domain, falling back on bad values", () => {
    expect(resolveQaScoringPolicy({ estimationThreshold: 82, domain: "legal" })).toMatchObject({
      estimationThreshold: 82,
      domain: "legal",
    });
    expect(resolveQaScoringPolicy({ estimationThreshold: -4, domain: "aerospace" })).toMatchObject({
      estimationThreshold: 0,
      domain: "general",
    });
  });
});

describe("computeQaQuality penalties snapshot", () => {
  it("stores the overrides it used so rescoring can repeat the score", () => {
    const quality = computeQaQuality({
      policy: { ...policy, penalties: { spelling: "major" } },
      wordCountByLocale: { "de-DE": 10 },
      findings: [],
    });
    expect(quality.penalties).toEqual({ spelling: "major" });
  });
});

describe("countSourceWords", () => {
  it("counts space-separated tokens in spaced scripts", () => {
    expect(countSourceWords("  Save {count} files now ", "en-US")).toBe(4);
    expect(countSourceWords("", "en-US")).toBe(0);
    expect(countSourceWords("   ", "en-US")).toBe(0);
  });

  it("segments Chinese, Japanese and Thai into words instead of one token per sentence", () => {
    expect(countSourceWords("我们今天去公园散步", "zh-CN")).toBeGreaterThan(3);
    expect(countSourceWords("今日は良い天気ですね", "ja-JP")).toBeGreaterThan(3);
    expect(countSourceWords("วันนี้อากาศดีมาก", "th-TH")).toBeGreaterThan(2);
  });

  it("falls back to a root segmenter for an unknown locale", () => {
    expect(countSourceWords("我们今天去公园散步", "not a locale")).toBeGreaterThan(3);
  });
});

describe("QA_CHECK_DIMENSIONS", () => {
  it("covers every check type", () => {
    for (const checkType of translationQaCheckTypes) {
      expect(QA_CHECK_DIMENSIONS[checkType]).toBeDefined();
    }
  });
});
