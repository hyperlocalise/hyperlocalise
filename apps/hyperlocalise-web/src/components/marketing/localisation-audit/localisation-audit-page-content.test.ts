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
    expect(copy.methodologyHeading).toBe("What we notice");
    expect(copy.notices).toHaveLength(3);
    expect(copy.notices[0]?.title).toBe("Voice");
    expect(copy.leaderboardHeading).toBe("How other sites score");
    expect(copy.startError).toContain("Check the URL");
  });

  it("returns localized landing copy for supported locales", () => {
    expect(getLocalisationAuditPageCopy("fr-FR").headline).toBe(
      "Voyez comment votre marque voyage.",
    );
    expect(getLocalisationAuditPageCopy("de-DE").submit).toBe("Meinen Score anzeigen");
    expect(getLocalisationAuditPageCopy("zh-CN").methodologyHeading).toBe("我们关注什么");
    expect(getLocalisationAuditPageCopy("vi-VN").leaderboardEmpty).toBe(
      "Chưa có điểm công khai. Hãy là người đầu tiên.",
    );
  });

  it("returns localized result copy and interpolates ICU values", () => {
    const english = getLocalisationAuditResultCopy("en");
    const french = getLocalisationAuditResultCopy("fr-FR");

    expect(english.runningTitle).toBe("Running localisation audit");
    expect(english.creditsHeading).toBe("Audit criteria");
    expect(english.progressStepOf({ current: 2, total: 5 })).toBe("Step 2 of 5");
    expect(english.criteriaSummary({ passed: 8, failed: 3, na: 1 })).toBe(
      "8 passed · 3 to fix · 1 not applicable",
    );
    expect(french.runningTitle).toBe("Audit de localisation en cours");
    expect(french.standingRank({ rank: 4, total: 20 })).toBe("Rang n°4 sur 20 audits publics");
    expect(french.sampledPages({ count: 6 })).toContain("6 pages");
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
