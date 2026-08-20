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
  companyProfileFromAuditPayloads,
  isCompanyProfileIncomplete,
  mergeCompanyProfiles,
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

  it("keeps hyphenated brand names while still stripping spaced title separators", () => {
    const hyphenated = emptyCrawledPage({
      url: "https://coca-cola.example/",
      title: "Coca-Cola | Soft drinks",
    });
    expect(
      buildHeuristicCompanyProfile({ domainKey: "coca-cola.example", page: hyphenated }).name,
    ).toBe("Coca-Cola");

    const spacedHyphen = emptyCrawledPage({
      url: "https://acme.example/",
      title: "Acme - Global billing",
    });
    expect(
      buildHeuristicCompanyProfile({ domainKey: "acme.example", page: spacedHyphen }).name,
    ).toBe("Acme");
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

const completeProfile = {
  name: "Acme",
  logoUrl: "https://acme.example/logo.png",
  productSummary: "Payments for global teams.",
  brandVoice: "calm, precise",
  industry: "Fintech",
  confidence: 80,
};

describe("isCompanyProfileIncomplete", () => {
  it("treats a missing profile and any blank cover field as incomplete", () => {
    expect(isCompanyProfileIncomplete(null)).toBe(true);
    expect(isCompanyProfileIncomplete(completeProfile)).toBe(false);
    expect(isCompanyProfileIncomplete({ ...completeProfile, logoUrl: null })).toBe(true);
    expect(isCompanyProfileIncomplete({ ...completeProfile, productSummary: "  " })).toBe(true);
    expect(isCompanyProfileIncomplete({ ...completeProfile, brandVoice: null })).toBe(true);
  });
});

describe("mergeCompanyProfiles", () => {
  it("fills gaps from the incoming profile and keeps stored values when the crawl misses them", () => {
    expect(mergeCompanyProfiles(null, completeProfile)).toEqual(completeProfile);

    const merged = mergeCompanyProfiles(
      {
        name: "Acme",
        logoUrl: "https://acme.example/old-logo.png",
        productSummary: null,
        brandVoice: null,
        industry: "Fintech",
        confidence: 40,
      },
      {
        name: "Acme Inc",
        logoUrl: null,
        productSummary: "Payments for global teams.",
        brandVoice: "calm, precise",
        industry: null,
        confidence: 70,
      },
    );

    expect(merged).toEqual({
      name: "Acme Inc",
      logoUrl: "https://acme.example/old-logo.png",
      productSummary: "Payments for global teams.",
      brandVoice: "calm, precise",
      industry: "Fintech",
      confidence: 70,
    });
  });
});

describe("companyProfileFromAuditPayloads", () => {
  it("prefers the full report profile over the teaser", () => {
    expect(
      companyProfileFromAuditPayloads({
        teaser: { companyProfile: { ...completeProfile, name: "Teaser" } },
        report: { companyProfile: completeProfile },
      }),
    ).toEqual(completeProfile);
    expect(companyProfileFromAuditPayloads({ teaser: null, report: null })).toBeNull();
  });
});
