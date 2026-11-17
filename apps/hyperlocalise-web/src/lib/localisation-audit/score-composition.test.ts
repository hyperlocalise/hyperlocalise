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

import { LOCALISATION_AUDIT_METHODOLOGY_VERSION } from "./credits/catalog";
import { buildLocalisationAuditCriteria } from "./criteria";
import { aggregateLocalisationAuditCredits } from "./score";
import {
  composeLocalisationAuditScore,
  describeLocalisationAuditScoringModel,
  rankCriteriaByGain,
} from "./score-composition";
import type { LocalisationAuditCreditResult } from "./types";

const credits: LocalisationAuditCreditResult[] = [
  { id: "locale-detection", dimension: "technical", score: 40, method: "heuristic" },
  { id: "hreflang", dimension: "technical", score: 100, method: "heuristic" },
  { id: "sitemap", dimension: "technical", score: 80, method: "heuristic" },
  { id: "canonical-urls", dimension: "technical", score: null, method: "na" },
  { id: "language-switcher", dimension: "technical", score: 20, method: "luna" },
];

function criteria() {
  return buildLocalisationAuditCriteria(credits, [], {
    methodologyVersion: LOCALISATION_AUDIT_METHODOLOGY_VERSION,
  });
}

describe("composeLocalisationAuditScore", () => {
  it("reproduces the aggregated score for every coverage step", () => {
    for (const localeCount of [0, 1, 2, 3, 4]) {
      const aggregated = aggregateLocalisationAuditCredits(credits, { localeCount });
      const composition = composeLocalisationAuditScore(criteria(), {
        coverageFactor: aggregated.localeCoverageFactor,
        reportedScore: aggregated.score,
      });

      expect(composition?.finalScore).toBe(aggregated.score);
      expect(composition?.matchesReportedScore).toBe(true);
    }
  });

  it("attributes every lost point to a scored check", () => {
    const composition = composeLocalisationAuditScore(criteria(), {
      coverageFactor: 0.86,
      reportedScore: null,
    })!;

    // weights: locale-detection 3, hreflang 3, sitemap 1 → total 7
    expect(composition.scoredChecks).toBe(3);
    expect(composition.baseScore).toBeCloseTo((40 * 3 + 100 * 3 + 80 * 1) / 7);
    expect(composition.gainByCriterion.get("locale-detection")).toBeCloseTo(((3 * 60) / 7) * 0.86);
    expect(composition.gainByCriterion.has("language-switcher")).toBe(false);

    const lost = composition.dimensions.reduce((sum, item) => sum + item.pointsLost, 0);
    expect(100 - lost).toBeCloseTo(composition.baseScore);
    expect(composition.baseScore - composition.coveragePenalty).toBeCloseTo(
      composition.baseScore * 0.86,
    );
  });

  it("flags stored scores it cannot reproduce", () => {
    const composition = composeLocalisationAuditScore(criteria(), {
      coverageFactor: 1,
      reportedScore: 20,
    });
    expect(composition?.matchesReportedScore).toBe(false);
  });

  it("returns null without scored checks", () => {
    expect(
      composeLocalisationAuditScore([], { coverageFactor: 1, reportedScore: null }),
    ).toBeNull();
  });

  it("ranks checks below the pass mark by score gain", () => {
    const all = criteria();
    const composition = composeLocalisationAuditScore(all, {
      coverageFactor: 1,
      reportedScore: null,
    })!;

    expect(rankCriteriaByGain(all, composition).map((item) => item.criterion.id)).toEqual([
      "locale-detection",
      "sitemap",
    ]);
  });
});

describe("describeLocalisationAuditScoringModel", () => {
  it("covers every catalog check and splits measurable weight across dimensions", () => {
    const model = describeLocalisationAuditScoringModel();
    const share = model.dimensions.reduce((sum, item) => sum + item.weightShare, 0);

    expect(model.dimensions.map((item) => item.dimension)).toEqual([
      "technical",
      "linguistic",
      "contextual",
      "visual",
    ]);
    expect(model.dimensions.reduce((sum, item) => sum + item.checks, 0)).toBe(model.totalChecks);
    expect(share).toBeCloseTo(1);
    expect(model.measurableChecks).toBeLessThan(model.totalChecks);
  });
});
