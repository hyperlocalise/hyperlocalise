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

import { DomainKeywordsUiStore } from "./domain-keywords-ui-store";
import { DomainResearchUiStore } from "./domain-research-ui-store";
import { DomainResearchShellStore } from "./domain-research-shell-store";
import { DomainSearchConsoleUiStore } from "./domain-search-console-ui-store";

describe("DomainKeywordsUiStore", () => {
  it("filters, selects, and resets against the catalog", () => {
    const catalog = getResearchPrototypeCatalog("hyperlocalise-com")!;
    const store = new DomainKeywordsUiStore();
    store.syncMarket(catalog.market.id, catalog.keywords[0]?.id ?? null);

    store.setQuery(catalog.keywords[0]!.keyword);
    store.commitLocalSearch(catalog);
    expect(store.search).toBe(catalog.keywords[0]!.keyword);
    expect(store.rows(catalog, false).some((row) => row.id === catalog.keywords[0]!.id)).toBe(true);

    store.toggleSelected(catalog.keywords[0]!.id, true);
    expect(store.selectedRows(catalog, false)).toHaveLength(1);

    store.patchFilter("minVolume", "999999");
    expect(store.activeFilterCount).toBe(1);
    expect(store.rows(catalog, false)).toHaveLength(0);

    store.reset(catalog);
    expect(store.search).toBe("");
    expect(store.activeFilterCount).toBe(0);
    expect(store.selected).toEqual([]);
    expect(store.active(catalog, false)?.id).toBe(catalog.keywords[0]?.id);
  });

  it("keeps expanded ideas until persist, then restores catalog keywords", () => {
    const catalog = getResearchPrototypeCatalog("hyperlocalise-com")!;
    const store = new DomainKeywordsUiStore();
    store.syncMarket(catalog.market.id, catalog.keywords[0]?.id ?? null);

    const idea = {
      ...catalog.keywords[0]!,
      id: "seed-idea",
      keyword: "seeded keyword",
    };
    store.applySeedResults({
      ideas: [idea],
      marketId: catalog.market.id,
      seedKeyword: "seed",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(store.sourceKeywords(catalog)).toEqual([idea]);
    expect(store.activeId).toBe("seed-idea");

    store.syncMarket(catalog.market.id, catalog.keywords[0]?.id ?? null);
    expect(store.sourceKeywords(catalog)).toEqual([idea]);

    store.applyPersistSuccess();
    expect(store.sourceKeywords(catalog)).toEqual(catalog.keywords);
    expect(store.ideas).toBeNull();
  });

  it("resets when the market changes", () => {
    const catalog = getResearchPrototypeCatalog("hyperlocalise-com")!;
    const store = new DomainKeywordsUiStore();
    store.syncMarket(catalog.market.id, catalog.keywords[0]?.id ?? null);
    store.setQuery("keep me");
    store.toggleFilters();

    store.syncMarket("germany-de", "other-keyword");
    expect(store.query).toBe("");
    expect(store.showFilters).toBe(false);
    expect(store.activeId).toBe("other-keyword");
    expect(store.marketId).toBe("germany-de");
  });
});

describe("DomainSearchConsoleUiStore", () => {
  it("stores date range, table tab, and inspection results", () => {
    const store = new DomainSearchConsoleUiStore();
    store.setDateRange("last_7_days");
    store.setTab("pages");
    store.setInspectUrl("https://hyperlocalise.com/fr");
    store.beginInspect();
    expect(store.inspecting).toBe(true);

    store.finishInspect({ indexStatusResult: { verdict: "PASS" } });
    expect(store.inspecting).toBe(false);
    expect(store.inspection?.indexStatusResult?.verdict).toBe("PASS");
    expect(store.dateRange).toBe("last_7_days");
    expect(store.tab).toBe("pages");
  });
});

describe("DomainResearchUiStore", () => {
  it("keeps dialog, tab, and prompt chrome", () => {
    const store = new DomainResearchUiStore();
    store.setRanksAddOpen(true);
    store.setBrandAddOpen(true);
    store.setOverviewTab("pages");
    store.syncPrompt("france-fr", "How does this brand compare?");
    store.setPrompt("edited prompt");
    store.syncPrompt("france-fr", "ignored catalog prompt");

    expect(store.ranksAddOpen).toBe(true);
    expect(store.brandAddOpen).toBe(true);
    expect(store.overviewTab).toBe("pages");
    expect(store.prompt).toBe("edited prompt");

    store.syncPrompt("germany-de", "German prompt");
    expect(store.prompt).toBe("German prompt");
  });

  it("closes ranks and brand dialogs when the market changes", () => {
    const store = new DomainResearchUiStore();
    store.syncSurface("france-fr");
    store.setRanksAddOpen(true);
    store.setBrandAddOpen(true);
    store.setOverviewTab("pages");

    store.syncSurface("france-fr");
    expect(store.ranksAddOpen).toBe(true);
    expect(store.overviewTab).toBe("pages");

    store.syncSurface("germany-de");
    expect(store.ranksAddOpen).toBe(false);
    expect(store.brandAddOpen).toBe(false);
    expect(store.overviewTab).toBe("keywords");
  });
});

describe("DomainResearchShellStore composition", () => {
  it("owns keyword, Search Console, and chrome UI stores", () => {
    const store = new DomainResearchShellStore({
      organizationSlug: "acme",
      linkedDomainId: "hyperlocalise-com",
      surface: "keywords",
    });

    expect(store.keywords).toBeInstanceOf(DomainKeywordsUiStore);
    expect(store.searchConsole).toBeInstanceOf(DomainSearchConsoleUiStore);
    expect(store.ui).toBeInstanceOf(DomainResearchUiStore);
  });
});
