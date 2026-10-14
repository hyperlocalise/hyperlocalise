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
import { makeAutoObservable } from "mobx";

import {
  DEFAULT_KEYWORD_SORT,
  EMPTY_KEYWORD_FILTERS,
  filterKeywordIdeas,
  resolveActiveKeyword,
  type KeywordFilters,
  type KeywordSort,
} from "@/lib/domains/keyword-screen";
import type {
  DomainResearchCatalog,
  KeywordIdea,
  SerpResult,
} from "@/lib/domains/research-prototype";

export class DomainKeywordsUiStore {
  query = "";
  search = "";
  filters: KeywordFilters = { ...EMPTY_KEYWORD_FILTERS };
  showFilters = false;
  sort: KeywordSort = { ...DEFAULT_KEYWORD_SORT };
  selected: string[] = [];
  activeId: string | null = null;
  ideas: KeywordIdea[] | null = null;
  expandedMarketId: string | null = null;
  seedKeyword: string | undefined = undefined;
  expandedCapturedAt: string | undefined = undefined;
  seedPending = false;
  persistPending = false;
  liveSerpResults: SerpResult[] | null = null;
  serpKeywordId: string | null = null;
  serpPending = false;
  marketId: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get activeFilterCount() {
    return Object.entries(this.filters).filter(
      ([key, value]) => value !== "" && !(key === "intent" && value === "all"),
    ).length;
  }

  sourceKeywords(catalog: DomainResearchCatalog) {
    return this.ideas && this.expandedMarketId === catalog.market.id
      ? this.ideas
      : catalog.keywords;
  }

  rows(catalog: DomainResearchCatalog, live: boolean) {
    return filterKeywordIdeas(
      this.sourceKeywords(catalog),
      live ? "" : this.search,
      this.filters,
      this.sort,
    );
  }

  active(catalog: DomainResearchCatalog, live: boolean) {
    return resolveActiveKeyword(this.rows(catalog, live), this.activeId);
  }

  selectedRows(catalog: DomainResearchCatalog, live: boolean) {
    const selected = new Set(this.selected);
    return this.rows(catalog, live).filter((row) => selected.has(row.id));
  }

  allSelected(catalog: DomainResearchCatalog, live: boolean) {
    const rows = this.rows(catalog, live);
    return rows.length > 0 && this.selectedRows(catalog, live).length === rows.length;
  }

  serpResults(catalog: DomainResearchCatalog, live: boolean) {
    const active = this.active(catalog, live);
    if (live && this.serpKeywordId === active?.id && this.liveSerpResults) {
      return this.liveSerpResults;
    }
    return active ? (catalog.serpByKeywordId[active.id] ?? []) : [];
  }

  syncMarket(marketId: string, fallbackActiveId: string | null) {
    if (this.marketId === marketId) {
      if (this.activeId == null && fallbackActiveId) {
        this.activeId = fallbackActiveId;
      }
      return;
    }
    this.resetForMarket(marketId, fallbackActiveId);
  }

  setQuery(query: string) {
    this.query = query;
  }

  setShowFilters(open: boolean) {
    this.showFilters = open;
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  patchFilter<K extends keyof KeywordFilters>(name: K, value: KeywordFilters[K]) {
    this.filters = { ...this.filters, [name]: value };
  }

  clearFilters() {
    this.filters = { ...EMPTY_KEYWORD_FILTERS };
  }

  toggleSort(field: KeywordSort["field"]) {
    this.sort = {
      field,
      direction: this.sort.field === field && this.sort.direction === "desc" ? "asc" : "desc",
    };
  }

  setActiveId(activeId: string | null) {
    this.activeId = activeId;
  }

  setSelectedIds(ids: string[]) {
    this.selected = ids;
  }

  toggleSelected(id: string, selected: boolean) {
    if (selected) {
      if (!this.selected.includes(id)) {
        this.selected = [...this.selected, id];
      }
      return;
    }
    this.selected = this.selected.filter((item) => item !== id);
  }

  clearSelection() {
    this.selected = [];
  }

  commitLocalSearch(catalog: DomainResearchCatalog) {
    const nextQuery = this.query.trim();
    this.search = nextQuery;
    this.selected = [];
    this.activeId =
      filterKeywordIdeas(this.sourceKeywords(catalog), nextQuery, this.filters, this.sort)[0]?.id ??
      null;
  }

  setSeedPending(pending: boolean) {
    this.seedPending = pending;
  }

  applySeedResults(input: {
    ideas: KeywordIdea[];
    marketId: string;
    seedKeyword: string;
    capturedAt: string | undefined;
  }) {
    this.ideas = input.ideas;
    this.expandedMarketId = input.marketId;
    this.seedKeyword = input.seedKeyword;
    this.expandedCapturedAt = input.capturedAt;
    this.search = "";
    this.selected = [];
    this.activeId = input.ideas[0]?.id ?? null;
  }

  setPersistPending(pending: boolean) {
    this.persistPending = pending;
  }

  applyPersistSuccess() {
    this.selected = [];
    this.ideas = null;
    this.expandedMarketId = null;
    this.seedKeyword = undefined;
    this.expandedCapturedAt = undefined;
  }

  setSerpPending(pending: boolean) {
    this.serpPending = pending;
  }

  applySerp(keywordId: string, results: SerpResult[] | null) {
    this.activeId = keywordId;
    this.serpKeywordId = keywordId;
    this.liveSerpResults = results;
  }

  reset(catalog: DomainResearchCatalog) {
    this.resetForMarket(catalog.market.id, catalog.keywords[0]?.id ?? null);
  }

  private resetForMarket(marketId: string, fallbackActiveId: string | null) {
    this.marketId = marketId;
    this.query = "";
    this.search = "";
    this.filters = { ...EMPTY_KEYWORD_FILTERS };
    this.showFilters = false;
    this.sort = { ...DEFAULT_KEYWORD_SORT };
    this.selected = [];
    this.activeId = fallbackActiveId;
    this.ideas = null;
    this.expandedMarketId = null;
    this.seedKeyword = undefined;
    this.expandedCapturedAt = undefined;
    this.seedPending = false;
    this.persistPending = false;
    this.liveSerpResults = null;
    this.serpKeywordId = null;
    this.serpPending = false;
  }
}
