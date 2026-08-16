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

  it("returns result copy and interpolates ICU values", () => {
    const copy = getLocalisationAuditResultCopy("en");

    expect(copy.runningTitle).toBe("Running localisation audit");
    expect(copy.creditsHeading).toBe("Audit criteria");
    expect(copy.progressStepOf({ current: 2, total: 5 })).toBe("Step 2 of 5");
    expect(copy.criteriaSummary({ passed: 8, failed: 3, na: 1 })).toBe(
      "8 passed · 3 to fix · 1 not applicable",
    );
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
