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
import type { AuditCategory, AuditScores, CategoryScore, RuleEvaluation } from "./types";
import { LOCALISATION_AUDIT_SCORE_VERSION } from "./types";

const CATEGORY_CONFIG: Record<AuditCategory, { weight: number; minimumApplicablePoints: number }> =
  {
    technical: { weight: 0.4, minimumApplicablePoints: 20 },
    linguistic: { weight: 0.4, minimumApplicablePoints: 10 },
    market: { weight: 0.2, minimumApplicablePoints: 8 },
  };

function scoreCategory(category: AuditCategory, evaluations: RuleEvaluation[]): CategoryScore {
  const applicable = evaluations.filter(
    (evaluation) => evaluation.category === category && evaluation.applicable,
  );
  const applicablePoints = applicable.reduce(
    (total, evaluation) => total + evaluation.availablePoints,
    0,
  );
  const earnedPoints = applicable.reduce((total, evaluation) => total + evaluation.earnedPoints, 0);
  if (applicablePoints < CATEGORY_CONFIG[category].minimumApplicablePoints) {
    return {
      status: "insufficient_evidence",
      score: null,
      earnedPoints,
      applicablePoints,
      evaluatedRuleCount: applicable.length,
    };
  }

  return {
    status: "scored",
    score: Math.round((earnedPoints / applicablePoints) * 100),
    earnedPoints,
    applicablePoints,
    evaluatedRuleCount: applicable.length,
  };
}

export function calculateLocalisationAuditScores(evaluations: RuleEvaluation[]): AuditScores {
  const categoryScores = {
    technical: scoreCategory("technical", evaluations),
    linguistic: scoreCategory("linguistic", evaluations),
    market: scoreCategory("market", evaluations),
  };
  const allCategoriesScored = Object.values(categoryScores).every(
    (category) => category.status === "scored",
  );

  return {
    scoreVersion: LOCALISATION_AUDIT_SCORE_VERSION,
    overallStatus: allCategoriesScored ? "scored" : "insufficient_evidence",
    overallScore: allCategoriesScored
      ? Math.round(
          Object.entries(categoryScores).reduce(
            (total, [category, score]) =>
              total + (score.score ?? 0) * CATEGORY_CONFIG[category as AuditCategory].weight,
            0,
          ),
        )
      : null,
    categoryScores,
  };
}
