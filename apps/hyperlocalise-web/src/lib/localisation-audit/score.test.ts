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

import { aggregateLocalisationAuditCredits, pickHeadlineFindings } from "./score";
import type { LocalisationAuditCreditResult, LocalisationAuditFinding } from "./types";

function credit(
  partial: Partial<LocalisationAuditCreditResult> &
    Pick<LocalisationAuditCreditResult, "id" | "dimension">,
): LocalisationAuditCreditResult {
  return {
    score: 100,
    method: "heuristic",
    ...partial,
  };
}

function finding(
  severity: LocalisationAuditFinding["severity"],
  id: string,
): LocalisationAuditFinding {
  return {
    id,
    category: "technical",
    severity,
    title: id,
    summary: id,
  };
}

describe("aggregateLocalisationAuditCredits", () => {
  it("averages applicable credits equally within each dimension and 4x25 overall", () => {
    const result = aggregateLocalisationAuditCredits([
      credit({ id: "a", dimension: "technical", score: 80 }),
      credit({ id: "b", dimension: "technical", score: 100 }),
      credit({ id: "c", dimension: "linguistic", score: 60 }),
      credit({ id: "d", dimension: "contextual", score: 40 }),
      credit({ id: "e", dimension: "visual", score: 20 }),
    ]);

    expect(result.dimensionScores).toEqual({
      technical: 90,
      linguistic: 60,
      contextual: 40,
      visual: 20,
    });
    expect(result.score).toBe(53);
  });

  it("excludes N/A credits from the dimension mean instead of treating them as zero", () => {
    const result = aggregateLocalisationAuditCredits([
      credit({ id: "hreflang", dimension: "technical", score: 80 }),
      credit({ id: "sitemap", dimension: "technical", score: null, method: "na" }),
      credit({ id: "fluency", dimension: "linguistic", score: 100 }),
      credit({ id: "glossary-compliance", dimension: "contextual", score: null, method: "na" }),
      credit({ id: "cta-intent", dimension: "contextual", score: 50 }),
      credit({ id: "rtl-support", dimension: "visual", score: null, method: "na" }),
      credit({ id: "text-expansion", dimension: "visual", score: 90 }),
    ]);

    expect(result.dimensionScores.technical).toBe(80);
    expect(result.dimensionScores.contextual).toBe(50);
    expect(result.dimensionScores.visual).toBe(90);
    expect(result.score).toBe(80);
  });

  it("leaves dimensions with only N/A credits as null instead of 100", () => {
    const result = aggregateLocalisationAuditCredits([
      credit({ id: "hreflang", dimension: "technical", score: 80 }),
      credit({ id: "fluency", dimension: "linguistic", score: null, method: "na" }),
      credit({ id: "cta-intent", dimension: "contextual", score: 40 }),
      credit({ id: "rtl-support", dimension: "visual", score: null, method: "na" }),
    ]);

    expect(result.dimensionScores).toEqual({
      technical: 80,
      linguistic: null,
      contextual: 40,
      visual: null,
    });
    expect(result.score).toBe(60);
  });

  it("clamps the overall score to [0, 100]", () => {
    expect(aggregateLocalisationAuditCredits([]).score).toBe(0);
    expect(aggregateLocalisationAuditCredits([]).dimensionScores).toEqual({
      technical: null,
      linguistic: null,
      contextual: null,
      visual: null,
    });
    expect(
      aggregateLocalisationAuditCredits([
        credit({ id: "a", dimension: "technical", score: 100 }),
        credit({ id: "b", dimension: "linguistic", score: 100 }),
        credit({ id: "c", dimension: "contextual", score: 100 }),
        credit({ id: "d", dimension: "visual", score: 100 }),
      ]).score,
    ).toBe(100);
  });
});

describe("pickHeadlineFindings", () => {
  it("orders by spec severity and treats legacy warning as high", () => {
    const findings = [
      finding("info", "i1"),
      finding("critical", "c1"),
      finding("warning", "w1"),
      finding("medium", "m1"),
      finding("high", "h1"),
    ];

    expect(pickHeadlineFindings(findings, 3).map((item) => item.id)).toEqual(["c1", "w1", "h1"]);
  });

  it("does not mutate the input order", () => {
    const findings = [finding("info", "i1"), finding("critical", "c1")];
    pickHeadlineFindings(findings, 2);
    expect(findings.map((item) => item.id)).toEqual(["i1", "c1"]);
  });
});
