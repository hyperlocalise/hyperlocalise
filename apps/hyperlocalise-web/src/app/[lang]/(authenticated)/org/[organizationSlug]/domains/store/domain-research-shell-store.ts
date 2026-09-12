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
  filterCatalogForLocale,
  resolveDomainLocale,
  type DomainResearchCatalog,
  type DomainResearchNavId,
} from "@/lib/domains/research-prototype";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

import { buildDomainPath } from "@/components/app-shell/navigation-config";

export type DomainResearchShellLoadStatus = "idle" | "loading" | "error" | "success";

export class DomainResearchShellStore {
  readonly organizationSlug: string;
  readonly linkedDomainId: string;
  readonly surface: DomainResearchNavId;
  requestedLocaleId: string | null = null;
  search = "";
  catalog: DomainResearchCatalog | null = null;
  linkedDomain: LinkedDomainPublic | undefined;
  loadStatus: DomainResearchShellLoadStatus = "idle";

  constructor(input: {
    organizationSlug: string;
    linkedDomainId: string;
    surface: DomainResearchNavId;
    requestedLocaleId?: string | null;
    search?: string;
  }) {
    this.organizationSlug = input.organizationSlug;
    this.linkedDomainId = input.linkedDomainId;
    this.surface = input.surface;
    this.requestedLocaleId = input.requestedLocaleId ?? null;
    this.search = input.search ?? "";
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get domain() {
    return this.catalog?.domain ?? null;
  }

  get locale() {
    if (!this.domain) {
      return null;
    }
    return resolveDomainLocale(this.domain, this.requestedLocaleId);
  }

  get localeId() {
    return this.locale?.id ?? null;
  }

  get isPending() {
    return this.domain?.status !== "verified";
  }

  get verifyHref() {
    if (!this.domain?.domainSlug) {
      return null;
    }
    return `/org/${this.organizationSlug}/link-domain/${this.domain.domainSlug}`;
  }

  get filteredCatalog() {
    if (!this.catalog || !this.locale) {
      return null;
    }
    return filterCatalogForLocale(this.catalog, this.locale.id);
  }

  get activeCatalog() {
    const filtered = this.filteredCatalog;
    if (!filtered || !this.catalog) {
      return filtered;
    }

    const hasFilteredData = filtered.keywords.length > 0 || filtered.ranks.length > 0;
    const hasUnfilteredData = this.catalog.keywords.length > 0 || this.catalog.ranks.length > 0;
    if (!hasFilteredData && hasUnfilteredData) {
      return null;
    }

    return filtered;
  }

  get showLocaleEmpty() {
    return !this.isPending && this.locale !== null && this.activeCatalog === null;
  }

  get showResearchContent() {
    return !this.isPending && this.activeCatalog !== null;
  }

  setRequestedLocaleId(localeId: string | null) {
    this.requestedLocaleId = localeId;
  }

  setSearch(search: string) {
    this.search = search;
  }

  setResearchData(input: {
    catalog: DomainResearchCatalog | null;
    linkedDomain?: LinkedDomainPublic;
  }) {
    this.catalog = input.catalog;
    this.linkedDomain = input.linkedDomain;
  }

  setLoadStatus(status: DomainResearchShellLoadStatus) {
    this.loadStatus = status;
  }

  hrefForLocale(localeId: string) {
    const params = new URLSearchParams(this.search);
    params.set("locale", localeId);
    return `${buildDomainPath(this.organizationSlug, this.linkedDomainId, this.surface)}?${params}`;
  }

  canonicalLocaleHref(localeId: string) {
    if (this.requestedLocaleId === localeId) {
      return null;
    }
    return this.hrefForLocale(localeId);
  }
}
