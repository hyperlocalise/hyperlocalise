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
import { LOCALISATION_AUDIT_CREDITS } from "./credits/catalog";
import type { LocalisationAuditCriterion } from "./criteria";
import { localeCoverageFactor } from "./score";
import type { LocalisationAuditDimension } from "./types";

export const LOCALISATION_AUDIT_DIMENSIONS: readonly LocalisationAuditDimension[] = [
  "technical",
  "linguistic",
  "contextual",
  "visual",
];

/** Locale counts shown in the coverage table, matching `localeCoverageFactor`. */
export const LOCALISATION_AUDIT_COVERAGE_STEPS = [0, 1, 2, 3, 4].map((localeCount) => ({
  localeCount,
  factor: localeCoverageFactor(localeCount),
}));

/** Rounded score that was computed differently from the breakdown is not explained by it. */
const COMPOSITION_TOLERANCE = 1;

export type LocalisationAuditDimensionModel = {
  dimension: LocalisationAuditDimension;
  /** Checks in the catalog for this dimension. */
  checks: number;
  /** Checks that can be measured and so may count toward the score. */
  measurableChecks: number;
  /** Share of the overall score when every measurable check returns a result (0–1). */
  weightShare: number;
};

/**
 * Methodology summary for the landing page, derived from the credit catalog so the
 * copy never drifts from the weights the scorer uses.
 */
export function describeLocalisationAuditScoringModel() {
  const measurable = LOCALISATION_AUDIT_CREDITS.filter((credit) => credit.mode !== "luna");
  const totalWeight = measurable.reduce((sum, credit) => sum + credit.weight, 0);
  const dimensions: LocalisationAuditDimensionModel[] = LOCALISATION_AUDIT_DIMENSIONS.map(
    (dimension) => {
      const inDimension = LOCALISATION_AUDIT_CREDITS.filter(
        (credit) => credit.dimension === dimension,
      );
      const measurableInDimension = measurable.filter((credit) => credit.dimension === dimension);
      const weight = measurableInDimension.reduce((sum, credit) => sum + credit.weight, 0);
      return {
        dimension,
        checks: inDimension.length,
        measurableChecks: measurableInDimension.length,
        weightShare: totalWeight === 0 ? 0 : weight / totalWeight,
      };
    },
  );

  return {
    totalChecks: LOCALISATION_AUDIT_CREDITS.length,
    measurableChecks: measurable.length,
    maxWeight: Math.max(...LOCALISATION_AUDIT_CREDITS.map((credit) => credit.weight)),
    dimensions,
  };
}

export type LocalisationAuditDimensionComposition = {
  dimension: LocalisationAuditDimension;
  /** Share of the overall score carried by this dimension's scored checks (0–1). */
  weightShare: number;
  /** Points of the 100 this dimension lost before the coverage adjustment. */
  pointsLost: number;
  scoredChecks: number;
  failed: number;
  watch: number;
  passed: number;
};

export type LocalisationAuditScoreComposition = {
  scoredChecks: number;
  /** Weighted mean of scored checks before the locale coverage adjustment (unrounded). */
  baseScore: number;
  coverageFactor: number;
  /** Points removed by the coverage adjustment (unrounded). */
  coveragePenalty: number;
  /** Rounded final score, as `aggregateLocalisationAuditCredits` computes it. */
  finalScore: number;
  dimensions: LocalisationAuditDimensionComposition[];
  /** Points each scored check would add to the final score if it reached 100. */
  gainByCriterion: Map<string, number>;
  /** False when the stored score was computed under rules this breakdown cannot reproduce. */
  matchesReportedScore: boolean;
};

function countsTowardScore(criterion: LocalisationAuditCriterion) {
  return criterion.scored && criterion.status !== "na" && criterion.score != null;
}

/**
 * Rebuild the overall score from its checks. The overall score is the weighted mean
 * of scored checks times the locale coverage factor, so each check's shortfall from
 * 100 maps to an exact number of lost points:
 *
 *   points lost = weight × (100 − score) / total weight × coverage
 */
export function composeLocalisationAuditScore(
  criteria: LocalisationAuditCriterion[],
  options: { coverageFactor: number; reportedScore: number | null },
): LocalisationAuditScoreComposition | null {
  const scored = criteria.filter(countsTowardScore);
  const totalWeight = scored.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (scored.length === 0 || totalWeight === 0) return null;

  const coverageFactor = options.coverageFactor;
  const baseScore =
    scored.reduce((sum, criterion) => sum + criterion.score! * criterion.weight, 0) / totalWeight;
  const finalScore = Math.max(0, Math.min(100, Math.round(baseScore * coverageFactor)));

  const gainByCriterion = new Map<string, number>();
  for (const criterion of scored) {
    gainByCriterion.set(
      criterion.id,
      ((criterion.weight * (100 - criterion.score!)) / totalWeight) * coverageFactor,
    );
  }

  const dimensions = LOCALISATION_AUDIT_DIMENSIONS.map((dimension) => {
    const inDimension = scored.filter((criterion) => criterion.dimension === dimension);
    const weight = inDimension.reduce((sum, criterion) => sum + criterion.weight, 0);
    return {
      dimension,
      weightShare: weight / totalWeight,
      pointsLost: inDimension.reduce(
        (sum, criterion) => sum + (criterion.weight * (100 - criterion.score!)) / totalWeight,
        0,
      ),
      scoredChecks: inDimension.length,
      failed: inDimension.filter((criterion) => criterion.status === "fail").length,
      watch: inDimension.filter((criterion) => criterion.status === "watch").length,
      passed: inDimension.filter((criterion) => criterion.status === "pass").length,
    } satisfies LocalisationAuditDimensionComposition;
  });

  return {
    scoredChecks: scored.length,
    baseScore,
    coverageFactor,
    coveragePenalty: baseScore - baseScore * coverageFactor,
    finalScore,
    dimensions,
    gainByCriterion,
    matchesReportedScore:
      options.reportedScore == null ||
      Math.abs(options.reportedScore - finalScore) <= COMPOSITION_TOLERANCE,
  };
}

/** Scored checks below the pass mark, biggest score gain first. */
export function rankCriteriaByGain(
  criteria: LocalisationAuditCriterion[],
  composition: LocalisationAuditScoreComposition,
): Array<{ criterion: LocalisationAuditCriterion; gain: number }> {
  return criteria
    .filter((criterion) => criterion.status === "fail" || criterion.status === "watch")
    .flatMap((criterion) => {
      const gain = composition.gainByCriterion.get(criterion.id);
      return gain == null ? [] : [{ criterion, gain }];
    })
    .toSorted((a, b) => b.gain - a.gain);
}
