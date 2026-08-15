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
  buildLocalisationAuditCriteria,
  creditCriterionStatus,
  groupLocalisationAuditCriteria,
} from "./criteria";
import type { LocalisationAuditCreditResult, LocalisationAuditFinding } from "./types";

function credit(
  partial: Partial<LocalisationAuditCreditResult> & Pick<LocalisationAuditCreditResult, "id">,
): LocalisationAuditCreditResult {
  return {
    dimension: "technical",
    score: 100,
    method: "heuristic",
    ...partial,
  };
}

function finding(
  partial: Partial<LocalisationAuditFinding> & Pick<LocalisationAuditFinding, "id" | "creditId">,
): LocalisationAuditFinding {
  return {
    category: "technical",
    severity: "high",
    title: "Issue",
    summary: "Summary",
    ...partial,
  };
}

describe("creditCriterionStatus", () => {
  it("marks high scores as pass", () => {
    expect(creditCriterionStatus(credit({ id: "hreflang", score: 90 }))).toBe("pass");
    expect(creditCriterionStatus(credit({ id: "hreflang", score: 100 }))).toBe("pass");
  });

  it("marks scores below the pass threshold as fail", () => {
    expect(creditCriterionStatus(credit({ id: "hreflang", score: 89 }))).toBe("fail");
    expect(creditCriterionStatus(credit({ id: "hreflang", score: 0 }))).toBe("fail");
  });

  it("marks N/A credits as na", () => {
    expect(creditCriterionStatus(credit({ id: "glossary-compliance", score: null, method: "na" }))).toBe(
      "na",
    );
    expect(creditCriterionStatus(credit({ id: "fluency", score: null, method: "luna" }))).toBe("na");
  });
});

describe("buildLocalisationAuditCriteria", () => {
  it("joins catalog titles and groups findings by credit", () => {
    const criteria = buildLocalisationAuditCriteria(
      [
        credit({ id: "hreflang", score: 40 }),
        credit({ id: "canonical-urls", score: 100 }),
        credit({ id: "glossary-compliance", score: null, method: "na" }),
      ],
      [
        finding({ id: "f1", creditId: "hreflang", title: "Missing reciprocal hreflang" }),
        finding({ id: "f2", creditId: "hreflang", title: "Missing x-default" }),
      ],
    );

    expect(criteria.map((item) => item.id)).toEqual([
      "hreflang",
      "canonical-urls",
      "glossary-compliance",
    ]);
    expect(criteria[0]).toMatchObject({
      title: "hreflang",
      status: "fail",
      score: 40,
    });
    expect(criteria[0]?.findings.map((item) => item.id)).toEqual(["f1", "f2"]);
    expect(criteria[1]).toMatchObject({
      title: "Canonical URLs",
      status: "pass",
      findings: [],
    });
    expect(criteria[2]?.status).toBe("na");
  });

  it("skips unknown credit ids", () => {
    expect(buildLocalisationAuditCriteria([credit({ id: "not-a-real-credit", score: 50 })])).toEqual(
      [],
    );
  });
});

describe("groupLocalisationAuditCriteria", () => {
  it("buckets criteria into passed, failed, and not applicable", () => {
    const grouped = groupLocalisationAuditCriteria(
      buildLocalisationAuditCriteria([
        credit({ id: "hreflang", score: 40 }),
        credit({ id: "canonical-urls", score: 96 }),
        credit({ id: "glossary-compliance", score: null, method: "na" }),
      ]),
    );

    expect(grouped.failed.map((item) => item.id)).toEqual(["hreflang"]);
    expect(grouped.passed.map((item) => item.id)).toEqual(["canonical-urls"]);
    expect(grouped.notApplicable.map((item) => item.id)).toEqual(["glossary-compliance"]);
  });
});
