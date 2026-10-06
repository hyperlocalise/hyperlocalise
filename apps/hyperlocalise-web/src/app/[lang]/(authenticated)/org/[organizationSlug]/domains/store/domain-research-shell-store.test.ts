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

import { getResearchPrototypeCatalog } from "@/lib/domains/research-prototype";

import { DomainResearchShellStore } from "./domain-research-shell-store";

describe("DomainResearchShellStore", () => {
  it("resolves locale and verification state from catalog data", () => {
    const catalog = getResearchPrototypeCatalog("hyperlocalise-com")!;
    const store = new DomainResearchShellStore({
      organizationSlug: "acme",
      linkedDomainId: catalog.domain.id,
      surface: "overview",
      requestedLocaleId: catalog.domain.locales[0]?.id ?? null,
    });
    store.setResearchData({ catalog });
    store.setLoadStatus("success");

    expect(store.domain?.domainKey).toBe(catalog.domain.domainKey);
    expect(store.locale?.id).toBe(catalog.domain.locales[0]?.id);
    expect(store.isPending).toBe(false);
    expect(store.showResearchContent).toBe(true);
    expect(store.showSearchConsoleSurface).toBe(false);
  });

  it("shows Search Console without keyword or rank catalog data", () => {
    const catalog = getResearchPrototypeCatalog("hyperlocalise-com")!;
    const store = new DomainResearchShellStore({
      organizationSlug: "acme",
      linkedDomainId: catalog.domain.id,
      surface: "search-console",
      requestedLocaleId: "germany-de",
    });
    store.setResearchData({ catalog });
    store.setLoadStatus("success");

    expect(store.activeCatalog).toBeNull();
    expect(store.showResearchContent).toBe(false);
    expect(store.showSearchConsoleSurface).toBe(true);
  });

  it("builds locale-aware research hrefs", () => {
    const store = new DomainResearchShellStore({
      organizationSlug: "acme",
      linkedDomainId: "domain-1",
      surface: "keywords",
      search: "foo=bar",
    });

    expect(store.hrefForLocale("germany-de")).toContain("/org/acme/domains/domain-1/keywords?");
    expect(store.hrefForLocale("germany-de")).toContain("locale=germany-de");
    expect(store.hrefForLocale("germany-de")).toContain("foo=bar");
    expect(store.hrefWithoutLocale()).toBe("/org/acme/domains/domain-1/keywords?foo=bar");
  });

  it("uses saved linked-domain market ids instead of catalog locales", () => {
    const catalog = getResearchPrototypeCatalog("hyperlocalise-com")!;
    const store = new DomainResearchShellStore({
      organizationSlug: "acme",
      linkedDomainId: catalog.domain.id,
      surface: "overview",
      requestedLocaleId: "france-fr",
    });
    store.setResearchData({
      catalog,
      linkedDomain: {
        id: catalog.domain.id,
        organizationId: "org",
        domainKey: catalog.domain.domainKey,
        domainSlug: "hyperlocalise-com",
        sourceUrl: catalog.domain.sourceUrl,
        marketIds: ["germany-de"],
        status: "verified",
        preferredMethod: null,
        verifiedMethod: "dns_txt",
        verifiedAt: null,
        localisationAuditId: null,
        projectId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        challenges: {
          token: "t",
          dnsTxt: { host: "_hyperlocalise-verify", value: "t" },
          htmlFile: { path: "/p", url: "https://x/p", body: "t" },
          metaTag: { html: "<meta />" },
        },
        auditScore: null,
      },
    });
    store.setLoadStatus("success");

    expect(store.domain?.locales.map((locale) => locale.id)).toEqual(["germany-de"]);
    expect(store.locale?.id).toBe("germany-de");
  });
});
