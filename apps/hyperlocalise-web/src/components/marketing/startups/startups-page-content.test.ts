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
  getStartupsFaqItems,
  getStartupsPageCopy,
  slatorUrl,
  startmateLogoSrc,
  startmateUrl,
  startupsHeroImageSrc,
  trustedByLogos,
} from "./startups-page-content";

describe("startups page content", () => {
  it("exposes program assets and customer destinations", () => {
    expect(startupsHeroImageSrc).toBe("/images/nasa-gyp1xkjZNg8-unsplash.jpg");
    expect(startmateUrl).toBe("https://www.startmate.com");
    expect(startmateLogoSrc).toBe("/images/startmate-logo.svg");
    expect(slatorUrl).toBe("https://slator.com/2026-slator-language-ai-50-under-50/");
    expect(trustedByLogos.map((logo) => logo.id)).toEqual([
      "heidi-health",
      "tourfinder",
      "tourmatic",
    ]);
  });

  it("returns localized startups page copy with the offer and eligibility", () => {
    const copy = getStartupsPageCopy("en");

    expect(copy.brand).toBe("Hyperlocalise");
    expect(copy.headline).toBe("Hyperlocalise for startups");
    expect(copy.offerLine).toBe("Get up to 80% off Growth");
    expect(copy.applyCta).toBe("Apply for startup pricing");
    expect(copy.seePricingCta).toBe("See pricing");
    expect(copy.benefits).toHaveLength(3);
    expect(copy.benefits[0]?.title).toBe("Native TMS with AI agents");
    expect(copy.benefits[0]?.body).toContain("Skip buying Crowdin");
    expect(copy.subcopy).toContain("native TMS");
    expect(copy.tourfinderResult).toContain("Vietnamese and Japanese");
    expect(copy.programHeading).toBe("Hyperlocalise Startup Program");
    expect(copy.eligibility).toHaveLength(3);
    expect(copy.eligibility[1]).toContain("under 50 employees");
  });

  it("returns startups FAQ items covering apply and discount questions", () => {
    const faqItems = getStartupsFaqItems("en");

    expect(faqItems).toHaveLength(6);
    expect(faqItems[0]?.question).toBe("What is the Hyperlocalise Startup Program?");
    expect(faqItems[2]?.question).toBe("How do I apply?");
    expect(faqItems[3]?.question).toContain("another TMS first");
    expect(faqItems[3]?.answer).toContain("native TMS");
    expect(faqItems[4]?.answer).toContain("80%");
    expect(faqItems[5]?.answer).toContain("Growth or Enterprise");
  });
});
