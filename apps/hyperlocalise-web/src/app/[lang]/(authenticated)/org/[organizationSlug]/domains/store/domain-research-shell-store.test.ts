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
  });
});
