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
  pickRelatedLocalisationAuditScores,
  RELATED_LOCALISATION_AUDIT_SCORE_LIMIT,
  scheduledLocalisationAuditCategoryForDomainKey,
  type LocalisationAuditRelatedScore,
} from "./related-scores";

function relatedScore(
  overrides: Partial<LocalisationAuditRelatedScore> &
    Pick<LocalisationAuditRelatedScore, "domainKey" | "domainSlug" | "score">,
): LocalisationAuditRelatedScore {
  return {
    companyName: overrides.domainKey,
    logoUrl: null,
    ...overrides,
  };
}

describe("scheduledLocalisationAuditCategoryForDomainKey", () => {
  it("maps scheduled site hostnames, including www, onto a category", () => {
    expect(scheduledLocalisationAuditCategoryForDomainKey("stripe.com")).toBe("Finance & payments");
    expect(scheduledLocalisationAuditCategoryForDomainKey("www.stripe.com")).toBe(
      "Finance & payments",
    );
    expect(scheduledLocalisationAuditCategoryForDomainKey("nike.com")).toBe(
      "Retail & marketplaces",
    );
    expect(scheduledLocalisationAuditCategoryForDomainKey("acme.example")).toBeNull();
  });
});

describe("pickRelatedLocalisationAuditScores", () => {
  const stripe = relatedScore({
    domainKey: "stripe.com",
    domainSlug: "stripe-com",
    score: 70,
    companyName: "Stripe",
  });
  const paypal = relatedScore({
    domainKey: "paypal.com",
    domainSlug: "paypal-com",
    score: 40,
    companyName: "PayPal",
  });
  const wise = relatedScore({
    domainKey: "wise.com",
    domainSlug: "wise-com",
    score: 71,
    companyName: "Wise",
  });
  const nike = relatedScore({
    domainKey: "nike.com",
    domainSlug: "nike-com",
    score: 70,
    companyName: "Nike",
  });
  const amazon = relatedScore({
    domainKey: "amazon.com",
    domainSlug: "amazon-com",
    score: 90,
    companyName: "Amazon",
  });

  it("prefers the same scheduled category even when another site is closer in score", () => {
    const related = pickRelatedLocalisationAuditScores({
      domainKey: stripe.domainKey,
      domainSlug: stripe.domainSlug,
      score: stripe.score,
      entries: [stripe, paypal, nike],
    });

    expect(related.map((entry) => entry.domainKey)).toEqual(["paypal.com", "nike.com"]);
  });

  it("fills remaining slots with the closest other scores and caps the list", () => {
    const related = pickRelatedLocalisationAuditScores({
      domainKey: stripe.domainKey,
      domainSlug: stripe.domainSlug,
      score: stripe.score,
      entries: [stripe, paypal, wise, nike, amazon],
    });

    expect(related).toHaveLength(RELATED_LOCALISATION_AUDIT_SCORE_LIMIT);
    expect(related.map((entry) => entry.domainKey)).toEqual([
      "paypal.com",
      "wise.com",
      "nike.com",
      "amazon.com",
    ]);
  });

  it("always links the audits ranked directly above and below", () => {
    const tied = ["a", "b", "c", "d", "e"].map((letter) =>
      relatedScore({ domainKey: `${letter}.example`, domainSlug: `${letter}-example`, score: 70 }),
    );
    const current = tied[3];

    const related = pickRelatedLocalisationAuditScores({
      domainKey: current.domainKey,
      domainSlug: current.domainSlug,
      score: current.score,
      entries: tied,
      limit: 3,
    });

    // Score proximity alone would pick a, b and c; the rank neighbours c and e come first.
    expect(related.map((entry) => entry.domainKey)).toEqual([
      "c.example",
      "e.example",
      "a.example",
    ]);
  });

  it("excludes the current site by slug and domain key", () => {
    const related = pickRelatedLocalisationAuditScores({
      domainKey: "stripe.com",
      domainSlug: "stripe-com-other",
      score: 70,
      entries: [stripe, paypal],
    });

    expect(related.map((entry) => entry.domainKey)).toEqual(["paypal.com"]);
  });

  it("orders unscheduled sites by score proximity", () => {
    const related = pickRelatedLocalisationAuditScores({
      domainKey: "acme.example",
      domainSlug: "acme-example",
      score: 72,
      entries: [nike, amazon, paypal],
    });

    expect(related.map((entry) => entry.domainKey)).toEqual([
      "nike.com",
      "amazon.com",
      "paypal.com",
    ]);
  });

  it("returns an empty list when nothing else is available", () => {
    expect(
      pickRelatedLocalisationAuditScores({
        domainKey: stripe.domainKey,
        domainSlug: stripe.domainSlug,
        score: stripe.score,
        entries: [stripe],
      }),
    ).toEqual([]);
  });
});
