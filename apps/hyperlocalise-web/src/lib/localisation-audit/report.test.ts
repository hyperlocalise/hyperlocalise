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

import { createReportProjections } from "./report";
import type { AuditEvaluation, AuditFinding, AuditScores, AuditedPage } from "./types";

function finding(index: number): AuditFinding {
  return {
    code: `finding_${index}`,
    category: "technical",
    severity: "high",
    confidence: 1,
    evidenceKind: "observed",
    title: `Finding ${index}`,
    evidence: { excerpt: index === 1 ? "person@example.com private excerpt" : "evidence" },
    impact: "Impact",
    recommendation: "Recommendation",
    availablePoints: 10,
    earnedPoints: 0,
    pageUrl: "https://example.com/private-path",
    publicPreviewEligible: true,
  };
}

describe("localisation audit report projections", () => {
  it("keeps public summaries separate from private evidence and page details", () => {
    const scores: AuditScores = {
      scoreVersion: "2026-07-24.1",
      overallStatus: "scored",
      overallScore: 80,
      categoryScores: {
        technical: {
          status: "scored",
          score: 80,
          earnedPoints: 8,
          applicablePoints: 10,
          evaluatedRuleCount: 1,
        },
        linguistic: {
          status: "scored",
          score: 80,
          earnedPoints: 8,
          applicablePoints: 10,
          evaluatedRuleCount: 1,
        },
        market: {
          status: "scored",
          score: 80,
          earnedPoints: 8,
          applicablePoints: 10,
          evaluatedRuleCount: 1,
        },
      },
    };
    const evaluation: AuditEvaluation = {
      findings: [finding(1), finding(2), finding(3), finding(4)],
      rules: [],
      limitations: [],
    };
    const pages: AuditedPage[] = [
      {
        url: "https://example.com/private-path",
        locale: "en-US",
        isPrimary: true,
        status: "failed",
        failureCode: "test",
      },
    ];

    const { publicReport, privateReport } = createReportProjections({
      domain: "example.com",
      auditedAt: new Date("2026-07-24T12:00:00.000Z"),
      pages,
      evaluation,
      scores,
    });

    expect(publicReport.findings).toHaveLength(3);
    expect(publicReport.lockedFindingCount).toBe(1);
    expect(publicReport.status).toBe("partial");
    expect(JSON.stringify(publicReport)).not.toContain("person@example.com");
    expect(JSON.stringify(publicReport)).not.toContain("/private-path");
    expect(publicReport.findings[0]).not.toHaveProperty("evidence");
    expect(privateReport.findings).toHaveLength(4);
    expect(privateReport.pages).toEqual([
      {
        url: "https://example.com/private-path",
        locale: "en-US",
        status: "failed",
      },
    ]);
  });
});
