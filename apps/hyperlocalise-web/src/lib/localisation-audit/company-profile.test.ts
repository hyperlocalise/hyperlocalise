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
  buildHeuristicCompanyProfile,
  collectCompanyProfileEvidence,
  pickCompanyLogoUrl,
} from "./company-profile";
import { emptyCrawledPage } from "./types";

describe("pickCompanyLogoUrl", () => {
  it("prefers apple-touch icons over favicon and falls back to og:image", () => {
    const withIcons = emptyCrawledPage({
      url: "https://acme.example/",
      iconHrefs: ["/favicon.ico", "/apple-touch-icon.png"],
      ogImage: "/og.png",
    });
    expect(pickCompanyLogoUrl(withIcons)).toBe("https://acme.example/apple-touch-icon.png");

    const ogOnly = emptyCrawledPage({
      url: "https://acme.example/fr",
      ogImage: "/social.jpg",
    });
    expect(pickCompanyLogoUrl(ogOnly)).toBe("https://acme.example/social.jpg");
  });

  it("skips data URIs", () => {
    const page = emptyCrawledPage({
      url: "https://acme.example/",
      iconHrefs: ["data:image/png;base64,aaaa"],
      ogImage: "data:image/png;base64,bbbb",
    });
    expect(pickCompanyLogoUrl(page)).toBeNull();
  });
});

describe("buildHeuristicCompanyProfile", () => {
  it("uses title and meta description when Luna is unavailable", () => {
    const page = emptyCrawledPage({
      url: "https://acme.example/",
      title: "Acme — Global billing",
      metaDescription: "Acme helps teams take payments worldwide.",
      iconHrefs: ["/icon.png"],
    });
    const profile = buildHeuristicCompanyProfile({ domainKey: "acme.example", page });
    expect(profile.name).toBe("Acme");
    expect(profile.productSummary).toBe("Acme helps teams take payments worldwide.");
    expect(profile.logoUrl).toBe("https://acme.example/icon.png");
    expect(profile.brandVoice).toBeNull();
    expect(profile.industry).toBeNull();
    expect(profile.confidence).toBeGreaterThan(0);
  });
});

describe("collectCompanyProfileEvidence", () => {
  it("prefers the homepage when multiple pages are crawled", () => {
    const evidence = collectCompanyProfileEvidence({
      domainKey: "acme.example",
      pages: [
        emptyCrawledPage({
          url: "https://acme.example/pricing",
          title: "Pricing",
          metaDescription: "Plans",
        }),
        emptyCrawledPage({
          url: "https://acme.example/",
          title: "Acme",
          metaDescription: "Payments for global teams",
          headings: ["Ship globally"],
          iconHrefs: ["/logo.png"],
        }),
      ],
    });

    expect(evidence?.pageUrl).toBe("https://acme.example/");
    expect(evidence?.title).toBe("Acme");
    expect(evidence?.logoUrl).toBe("https://acme.example/logo.png");
  });
});
