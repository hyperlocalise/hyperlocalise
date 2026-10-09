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
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

export type DomainsPageLoadStatus = "idle" | "loading" | "error" | "success";

export class DomainsPageStore {
  readonly organizationSlug: string;
  domains: DomainResearchDomain[] = [];
  linkedDomains: LinkedDomainPublic[] = [];
  loadStatus: DomainsPageLoadStatus = "idle";
  addDomainDialogOpen = false;
  editLinkedDomain: LinkedDomainPublic | null = null;

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

  linkedDomainById(id: string) {
    return this.linkedDomains.find((domain) => domain.id === id);
  }

  setLoadStatus(status: DomainsPageLoadStatus) {
    this.loadStatus = status;
  }

  setDomains(domains: DomainResearchDomain[]) {
    this.domains = domains;
  }

  setLinkedDomains(domains: LinkedDomainPublic[]) {
    this.linkedDomains = domains;
  }

  openAddDomainDialog() {
    this.editLinkedDomain = null;
    this.addDomainDialogOpen = true;
  }

  openEditLocales(domain: LinkedDomainPublic) {
    this.editLinkedDomain = domain;
    this.addDomainDialogOpen = true;
  }

  setAddDomainDialogOpen(open: boolean) {
    this.addDomainDialogOpen = open;
    if (!open) {
      this.editLinkedDomain = null;
    }
  }
}
