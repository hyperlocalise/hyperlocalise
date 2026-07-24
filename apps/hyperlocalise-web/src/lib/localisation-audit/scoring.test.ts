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

import { calculateLocalisationAuditScores } from "./scoring";
import type { RuleEvaluation } from "./types";

describe("localisation audit scoring", () => {
  it("returns insufficient evidence when no rules are applicable", () => {
    const scores = calculateLocalisationAuditScores([]);

    expect(scores.overallStatus).toBe("insufficient_evidence");
    expect(scores.overallScore).toBeNull();
    expect(scores.categoryScores).toEqual({
      technical: {
        status: "insufficient_evidence",
        score: null,
        earnedPoints: 0,
        applicablePoints: 0,
        evaluatedRuleCount: 0,
      },
      linguistic: {
        status: "insufficient_evidence",
        score: null,
        earnedPoints: 0,
        applicablePoints: 0,
        evaluatedRuleCount: 0,
      },
      market: {
        status: "insufficient_evidence",
        score: null,
        earnedPoints: 0,
        applicablePoints: 0,
        evaluatedRuleCount: 0,
      },
    });
  });

  it("calculates reproducible category scores and the 40/40/20 overall score", () => {
    const rules: RuleEvaluation[] = [
      {
        code: "t1",
        category: "technical",
        applicable: true,
        availablePoints: 20,
        earnedPoints: 10,
      },
      {
        code: "l1",
        category: "linguistic",
        applicable: true,
        availablePoints: 10,
        earnedPoints: 8,
      },
      {
        code: "m1",
        category: "market",
        applicable: true,
        availablePoints: 8,
        earnedPoints: 2,
      },
    ];

    const scores = calculateLocalisationAuditScores(rules);

    expect(scores.categoryScores.technical.score).toBe(50);
    expect(scores.categoryScores.linguistic.score).toBe(80);
    expect(scores.categoryScores.market.score).toBe(25);
    expect(scores.overallStatus).toBe("scored");
    expect(scores.overallScore).toBe(57);
    expect(scores.scoreVersion).toBe("2026-07-24.1");
  });

  it("does not reweight remaining categories when one lacks evidence", () => {
    const scores = calculateLocalisationAuditScores([
      {
        code: "t1",
        category: "technical",
        applicable: true,
        availablePoints: 20,
        earnedPoints: 20,
      },
      {
        code: "l1",
        category: "linguistic",
        applicable: true,
        availablePoints: 10,
        earnedPoints: 10,
      },
    ]);

    expect(scores.categoryScores.technical.score).toBe(100);
    expect(scores.categoryScores.market.status).toBe("insufficient_evidence");
    expect(scores.overallScore).toBeNull();
  });
});
