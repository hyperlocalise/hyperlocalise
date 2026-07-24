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

import { toAuditReportProjection } from "./localisation-audit-types";

describe("toAuditReportProjection", () => {
  it("normalizes the persisted report projection for the shared report UI", () => {
    const report = toAuditReportProjection({
      domain: "example.com",
      auditedAt: "2026-07-24T12:00:00.000Z",
      overallStatus: "scored",
      overallScore: 75,
      categoryScores: {
        technical: {
          status: "scored",
          score: 90,
          evaluatedRuleCount: 8,
        },
        linguistic: {
          status: "insufficient_evidence",
          score: null,
          evaluatedRuleCount: 2,
        },
        market: {
          status: "scored",
          score: 61,
          evaluatedRuleCount: 4,
        },
      },
      findings: [
        {
          code: "html_lang_missing",
          category: "technical",
          severity: "high",
          title: "Document language is missing",
          evidence: {
            expectedValue: "A valid BCP 47 language tag",
          },
          impact: "Assistive technology may use the wrong language.",
          recommendation: "Add a valid lang attribute.",
        },
      ],
      lockedFindingCount: 3,
      limitations: ["One locale was blocked."],
    });

    expect(report.overallScore).toEqual({
      state: "scored",
      score: 75,
      evaluatedRules: 0,
    });
    expect(report.categories.linguistic).toEqual({
      state: "insufficient_evidence",
      evaluatedRules: 2,
    });
    expect(report.findings[0]).toMatchObject({
      id: "html_lang_missing",
      businessImpact: "Assistive technology may use the wrong language.",
      evidence: "A valid BCP 47 language tag",
    });
    expect(report.previewFindings).toHaveLength(1);
  });
});
