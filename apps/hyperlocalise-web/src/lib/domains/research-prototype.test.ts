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
  DOMAIN_RESEARCH_SURFACES,
  filterCatalogForLocale,
  getResearchMarket,
  getResearchPrototypeCatalog,
  getResearchPrototypeDomain,
  isDomainResearchSurface,
  isLiveDomainResearchId,
  isResearchPrototypeDomain,
  linkedDomainToResearchDomain,
  listResearchPrototypeDomains,
  resolveDomainLocale,
} from "./research-prototype";

describe("research prototype catalog", () => {
  it("lists the Paper domain set", () => {
    expect(listResearchPrototypeDomains().map((domain) => domain.domainKey)).toEqual([
      "hyperlocalise.com",
      "acme.fr",
      "help.acme.com",
      "acme.jp",
      "docs.acme.com",
      "shop.acme.de",
    ]);
  });

  it("loads keyword research for the primary French domain", () => {
    const catalog = getResearchPrototypeCatalog("hyperlocalise-com");
    expect(catalog?.keywords).toHaveLength(10);
    expect(catalog?.keywords[0]?.keyword).toBe("traduction automatique");
    expect(catalog?.promptResults.find((result) => result.engine === "perplexity")?.mentioned).toBe(
      true,
    );
    expect(catalog?.promptResults.find((result) => result.engine === "gemini")?.mentioned).toBe(
      false,
    );
  });

  it("keeps pending domains empty until verification", () => {
    expect(getResearchPrototypeDomain("help-acme-com")?.status).toBe("pending_verification");
    expect(getResearchPrototypeCatalog("shop-acme-de")?.keywords).toEqual([]);
    expect(isResearchPrototypeDomain("missing")).toBe(false);
  });

  it("recognises research surfaces", () => {
    expect(DOMAIN_RESEARCH_SURFACES).toContain("prompts");
    expect(isDomainResearchSurface("keywords")).toBe(true);
    expect(isDomainResearchSurface("audit")).toBe(false);
  });

  it("maps markets to DataForSEO location codes", () => {
    expect(getResearchMarket("france-fr")?.locationCode).toBe(2250);
    expect(isLiveDomainResearchId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isLiveDomainResearchId("hyperlocalise-com")).toBe(false);
  });

  it("maps a claimed domain onto the research list shape", () => {
    expect(
      linkedDomainToResearchDomain({
        id: "11111111-1111-4111-8111-111111111111",
        domainKey: "example.fr",
        domainSlug: "example-fr",
        sourceUrl: "https://example.fr/",
        status: "verified",
        auditScore: 72,
      }),
    ).toMatchObject({
      domainKey: "example.fr",
      domainSlug: "example-fr",
      status: "verified",
      score: 72,
      locales: expect.arrayContaining([
        expect.objectContaining({ id: "france-fr", locationCode: 2250 }),
      ]),
    });
  });
});

describe("domain research locales", () => {
  it("does not substitute another locale's research when data is missing", () => {
    expect(
      getResearchPrototypeCatalog("hyperlocalise-com", "france-fr")?.keywords.length,
    ).toBeGreaterThan(0);
    expect(getResearchPrototypeCatalog("hyperlocalise-com", "germany-de")).toBeNull();
    expect(getResearchPrototypeCatalog("missing", "france-fr")).toBeNull();
  });
  it("keeps a second locale's catalog without replacing the first", () => {
    const french = getResearchPrototypeCatalog("hyperlocalise-com", "france-fr");
    const vietnamese = getResearchPrototypeCatalog("hyperlocalise-com", "vietnam-vi");
    expect(french?.keywords[0]?.keyword).toBe("traduction automatique");
    expect(vietnamese?.keywords[0]?.keyword).toBe("dịch tự động");
    expect(
      listResearchPrototypeDomains().filter((domain) => domain.id === "hyperlocalise-com"),
    ).toHaveLength(1);
  });
  it("resolves only supported locales, including after removing the active locale", () => {
    const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
    expect(resolveDomainLocale(domain, "germany-de").id).toBe("germany-de");
    expect(resolveDomainLocale(domain, "japan-ja").id).toBe("france-fr");
    expect(
      resolveDomainLocale({ ...domain, locales: domain.locales.slice(1) }, "france-fr").id,
    ).toBe("germany-de");
  });

  it("keeps only the selected locale's live keywords and ranks", () => {
    const french = getResearchPrototypeCatalog("hyperlocalise-com", "france-fr")!;
    const mixed = {
      ...french,
      keywords: [
        { ...french.keywords[0]!, id: "fr-kw", marketId: "france-fr" },
        {
          ...french.keywords[0]!,
          id: "de-kw",
          keyword: "maschinelle übersetzung",
          marketId: "germany-de",
        },
      ],
      ranks: [
        { ...french.ranks[0]!, id: "fr-rank", marketId: "france-fr" },
        { ...french.ranks[0]!, id: "de-rank", marketId: "germany-de" },
      ],
      overviewKeywords: [
        {
          id: "fr-rank",
          keyword: "traduction automatique",
          position: 22,
          volume: 8100,
          traffic: 0,
        },
        {
          id: "de-rank",
          keyword: "maschinelle übersetzung",
          position: 10,
          volume: 1000,
          traffic: 0,
        },
      ],
      serpByKeywordId: {
        "fr-kw": french.serpByKeywordId[french.keywords[0]!.id] ?? [],
        "de-kw": [],
      },
    };
    const filtered = filterCatalogForLocale(mixed, "germany-de");
    expect(filtered.market.id).toBe("germany-de");
    expect(filtered.keywords.map((keyword) => keyword.id)).toEqual(["de-kw"]);
    expect(filtered.ranks.map((row) => row.id)).toEqual(["de-rank"]);
    expect(filtered.overviewKeywords.map((row) => row.id)).toEqual(["de-rank"]);
    expect(Object.keys(filtered.serpByKeywordId)).toEqual(["de-kw"]);
  });
});
