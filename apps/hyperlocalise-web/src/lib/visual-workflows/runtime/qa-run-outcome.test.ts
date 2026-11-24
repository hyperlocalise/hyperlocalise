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

import { computeQaQuality } from "@/lib/qa/qa-scoring";

import { qaRunOutcome } from "./localization-actions";

describe("qaRunOutcome", () => {
  it("fails on any error when the project does not score translations", () => {
    expect(qaRunOutcome({ errorCount: 0 })).toEqual({
      passed: true,
      qualityScore: null,
      qualityThreshold: null,
      qualityByLocale: null,
    });
    expect(qaRunOutcome({ errorCount: 2 }).passed).toBe(false);
  });

  it("passes on the score even with errors when every language reaches the threshold", () => {
    const quality = computeQaQuality({
      policy: { enabled: true, passThreshold: 95, penalties: {} },
      wordCountByLocale: { "de-DE": 500 },
      findings: [{ checkType: "length", severity: "error", targetLocale: "de-DE" }],
    });

    expect(qaRunOutcome({ errorCount: 1, quality })).toEqual({
      passed: true,
      qualityScore: 99,
      qualityThreshold: 95,
      qualityByLocale: { "de-DE": { score: 99, passed: true } },
    });
  });

  it("fails when a language falls below the threshold", () => {
    const quality = computeQaQuality({
      policy: { enabled: true, passThreshold: 99.5, penalties: {} },
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
});
