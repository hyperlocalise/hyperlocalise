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

import { LOCALISATION_AUDIT_DAILY_RUN_LIMIT } from "@/lib/localisation-audit/types";

import {
  getLocalisationAuditGuideHref,
  getLocalisationAuditPageCopy,
  getLocalisationAuditResultCopy,
  interpretScore,
  interpretScoreCtaBand,
} from "./localisation-audit-page-content";

describe("localisation audit page content", () => {
  it("returns English landing copy for the source locale", () => {
    const copy = getLocalisationAuditPageCopy("en");

    expect(copy.headline).toBe("See how your brand travels.");
    expect(copy.submit).toBe("See my score");
    expect(copy.crawlAccessNoteBody).toContain("ordinary browser traffic");
    expect(copy.crawlAccessNoteUserAgent).toBe("User agent");
    expect(copy.scoringHeading).toBe("How the score works");
    expect(copy.notices.map((notice) => notice.title)).toEqual([
      "Technical",
      "Linguistic",
      "Contextual",
      "Visual",
    ]);
    expect(copy.leaderboardHeading).toBe("How other sites score");
    expect(copy.leaderboardSiteColumn).toBe("Site");
    expect(copy.leaderboardScoreColumn).toBe("Score");
    expect(copy.leaderboardScoreLabel({ score: 86 })).toBe("Score 86 out of 100");
    expect(copy.startError).toContain("Check the URL");
    expect(copy.onePerDomain({ limit: LOCALISATION_AUDIT_DAILY_RUN_LIMIT })).toBe(
      `One free look per site. ${LOCALISATION_AUDIT_DAILY_RUN_LIMIT} a day across all sites.`,
    );
  });

  it("returns result copy and interpolates ICU values", () => {
    const copy = getLocalisationAuditResultCopy("en");

    expect(copy.runningTitle).toBe("Running localisation audit");
    expect(copy.creditsHeading).toBe("Audit criteria");
    expect(copy.progressStepOf({ current: 2, total: 5 })).toBe("Step 2 of 5");
    expect(copy.criteriaSummary({ passed: 8, watch: 2, failed: 3, na: 1 })).toBe(
      "8 passed · 2 to watch · 3 to fix · 1 not applicable",
    );
    expect(copy.runningHeading({ domain: "acme.com" })).toBe("Auditing acme.com");
    expect(copy.fixFirstGain({ points: "4.2" })).toBe("+4.2 pts");
    expect(copy.livePages({ count: 1 })).toBe("1 page sampled");
    expect(copy.livePages({ count: 6 })).toBe("6 pages sampled");
    expect(copy.breakdownCoverage({ factor: "0.86" })).toBe("Language coverage × 0.86");
    expect(copy.pagesExpand({ count: 6 })).toBe("Show all 6 pages");
    expect(copy.sampledPages({ count: 6 })).toContain("6 pages");
  });

  it("points the scoring guide at the requested locale", () => {
    expect(getLocalisationAuditGuideHref("en")).toBe(
      "/en/blog/what-is-a-website-localisation-audit",
    );
    expect(getLocalisationAuditGuideHref("fr-FR")).toBe(
      "/fr-FR/blog/what-is-a-website-localisation-audit",
    );
  });

  it("maps scores to ratings and CTA bands", () => {
    expect(interpretScore(94)).toBe("excellent");
    expect(interpretScore(51)).toBe("needs-improvement");
    expect(interpretScore(null)).toBe("unknown");
    expect(interpretScoreCtaBand("good")).toBe("high");
    expect(interpretScoreCtaBand("poor")).toBe("low");
  });
});
