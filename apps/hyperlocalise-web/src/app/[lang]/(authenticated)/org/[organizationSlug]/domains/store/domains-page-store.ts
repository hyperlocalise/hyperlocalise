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

import type { DomainResearchDomain } from "@/lib/domains/research-prototype";
import { hostnameToDomainSlug } from "@/lib/localisation-audit/domain-slug";

export type DomainsPageLoadStatus = "idle" | "loading" | "error" | "success";

export class DomainsPageStore {
  readonly organizationSlug: string;
  domains: DomainResearchDomain[] = [];
  loadStatus: DomainsPageLoadStatus = "idle";
  linkDialogOpen = false;
  editLocalesDomain: DomainResearchDomain | null = null;

  constructor(organizationSlug: string) {
    this.organizationSlug = organizationSlug;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isLoading() {
    return this.loadStatus === "loading";
  }

  get isError() {
    return this.loadStatus === "error";
  }

  get isEmpty() {
    return this.loadStatus === "success" && this.domains.length === 0;
  }

  get hasDomains() {
    return this.loadStatus === "success" && this.domains.length > 0;
  }

  get linkDialogDomain() {
    return this.editLocalesDomain ?? undefined;
  }

  setLoadStatus(status: DomainsPageLoadStatus) {
    this.loadStatus = status;
  }

  setDomains(domains: DomainResearchDomain[]) {
    this.domains = domains;
  }

  openLinkDialog() {
    this.editLocalesDomain = null;
    this.linkDialogOpen = true;
  }

  openEditLocales(domain: DomainResearchDomain) {
    this.editLocalesDomain = domain;
    this.linkDialogOpen = true;
  }

  setLinkDialogOpen(open: boolean) {
    this.linkDialogOpen = open;
    if (!open) {
      this.editLocalesDomain = null;
    }
  }

  linkDomainPath(domainKey: string) {
    const domainSlug = hostnameToDomainSlug(domainKey);
    return `/org/${this.organizationSlug}/link-domain/${domainSlug}`;
  }
}
