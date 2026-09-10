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
  getResearchPrototypeCatalog,
  getResearchPrototypeDomain,
  isDomainResearchSurface,
  isResearchPrototypeDomain,
  listResearchPrototypeDomains,
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
});
