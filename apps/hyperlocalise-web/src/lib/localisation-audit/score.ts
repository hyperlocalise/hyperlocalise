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
import type {
  LocalisationAuditCreditResult,
  LocalisationAuditDimension,
  LocalisationAuditDimensionScores,
  LocalisationAuditFinding,
  LocalisationAuditFindingSeverity,
} from "./types";

const DIMENSIONS: LocalisationAuditDimension[] = [
  "technical",
  "linguistic",
  "contextual",
  "visual",
];

const SEVERITY_RANK: Record<LocalisationAuditFindingSeverity, number> = {
  critical: 0,
  high: 1,
  warning: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function aggregateLocalisationAuditCredits(credits: LocalisationAuditCreditResult[]): {
  score: number;
  dimensionScores: LocalisationAuditDimensionScores;
} {
  const dimensionScores = {
    technical: 100,
    linguistic: 100,
    contextual: 100,
    visual: 100,
  } satisfies LocalisationAuditDimensionScores;

  const applicableDimensions: LocalisationAuditDimension[] = [];
  for (const dimension of DIMENSIONS) {
    const scores = credits
      .filter(
        (credit) =>
          credit.dimension === dimension && credit.method !== "na" && credit.score != null,
      )
      .map((credit) => credit.score!);
    if (scores.length === 0) {
      continue;
    }
    dimensionScores[dimension] = roundScore(mean(scores));
    applicableDimensions.push(dimension);
  }

  const overall =
    applicableDimensions.length === 0
      ? 0
      : mean(applicableDimensions.map((dimension) => dimensionScores[dimension]));

  return {
    score: roundScore(overall),
    dimensionScores,
  };
}

export function pickHeadlineFindings(
  findings: LocalisationAuditFinding[],
  limit = 3,
): LocalisationAuditFinding[] {
  return findings
    .toSorted((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, limit);
}
