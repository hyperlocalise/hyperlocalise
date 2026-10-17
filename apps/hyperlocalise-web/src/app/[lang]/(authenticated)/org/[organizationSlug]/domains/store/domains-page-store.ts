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

import type { LinkedDomainVerificationMethod } from "@/lib/database/schema/linked-domains";
import type { DomainResearchDomain } from "@/lib/domains/research-prototype";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

export type DomainsPageLoadStatus = "idle" | "loading" | "error" | "success";
export type AddDomainDialogStep = "details" | "project" | "connect" | "markets";
export type AddDomainProjectMode = "create" | "existing" | "unassigned";

export type AddDomainMarketRecommendation = {
  marketId: string;
  organicCount: number;
  organicEtv: number;
  top10Count: number;
  hasOrganicVisibility: boolean;
};

export type AddDomainDialogHydration = {
  step: AddDomainDialogStep;
  domain: string;
  claimDomainSlug: string | null;
  linkedDomain: LinkedDomainPublic | null;
  recommendations: AddDomainMarketRecommendation[];
  selectedMarketIds: string[];
};

function emptyAddDomainWizard() {
  return {
    step: "details" as AddDomainDialogStep,
    domainKey: "",
    claimDomainSlug: null as string | null,
    linkedDomain: null as LinkedDomainPublic | null,
    projectMode: "create" as AddDomainProjectMode,
    projectId: "",
    method: "dns_txt" as LinkedDomainVerificationMethod,
    recommendations: [] as AddDomainMarketRecommendation[],
    selectedMarketIds: [] as string[],
    pending: false,
    error: null as string | null,
  };
}

export class DomainsPageStore {
  readonly organizationSlug: string;
  domains: DomainResearchDomain[] = [];
  loadStatus: DomainsPageLoadStatus = "idle";
  addDomainDialogOpen = false;
  editLocalesDomain: DomainResearchDomain | null = null;
  addDomainStep: AddDomainDialogStep = "details";
  addDomainKey = "";
  addDomainClaimSlug: string | null = null;
  addDomainLinked: LinkedDomainPublic | null = null;
  addDomainProjectMode: AddDomainProjectMode = "create";
  addDomainProjectId = "";
  addDomainMethod: LinkedDomainVerificationMethod = "dns_txt";
  addDomainRecommendations: AddDomainMarketRecommendation[] = [];
  addDomainSelectedMarketIds: string[] = [];
  addDomainPending = false;
  addDomainError: string | null = null;

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

  get dialogDomain() {
    return this.editLocalesDomain ?? undefined;
  }

  setLoadStatus(status: DomainsPageLoadStatus) {
    this.loadStatus = status;
  }

  setDomains(domains: DomainResearchDomain[]) {
    this.domains = domains;
  }

  openAddDomainDialog() {
    this.editLocalesDomain = null;
    this.resetAddDomainWizard();
    this.addDomainDialogOpen = true;
  }

  openEditLocales(domain: DomainResearchDomain) {
    this.editLocalesDomain = domain;
    this.resetAddDomainWizard();
    this.addDomainDialogOpen = true;
  }

  setAddDomainDialogOpen(open: boolean) {
    this.addDomainDialogOpen = open;
    if (!open) {
      this.editLocalesDomain = null;
      this.resetAddDomainWizard();
    }
  }

  hydrateAddDomainDialog(input: AddDomainDialogHydration) {
    this.addDomainStep = input.step;
    this.addDomainKey = input.domain;
    this.addDomainClaimSlug = input.claimDomainSlug;
    this.addDomainLinked = input.linkedDomain;
    this.addDomainProjectMode = "create";
    this.addDomainProjectId = "";
    this.addDomainMethod = "dns_txt";
    this.addDomainRecommendations = input.recommendations;
    this.addDomainSelectedMarketIds = input.selectedMarketIds;
    this.addDomainPending = false;
    this.addDomainError = null;
  }

  resetAddDomainWizard() {
    const empty = emptyAddDomainWizard();
    this.addDomainStep = empty.step;
    this.addDomainKey = empty.domainKey;
    this.addDomainClaimSlug = empty.claimDomainSlug;
    this.addDomainLinked = empty.linkedDomain;
    this.addDomainProjectMode = empty.projectMode;
    this.addDomainProjectId = empty.projectId;
    this.addDomainMethod = empty.method;
    this.addDomainRecommendations = empty.recommendations;
    this.addDomainSelectedMarketIds = empty.selectedMarketIds;
    this.addDomainPending = empty.pending;
    this.addDomainError = empty.error;
  }

  setAddDomainStep(step: AddDomainDialogStep) {
    this.addDomainStep = step;
  }

  setAddDomainKey(domain: string) {
    this.addDomainKey = domain;
  }

  setAddDomainClaimSlug(slug: string | null) {
    this.addDomainClaimSlug = slug;
  }

  setAddDomainLinked(linkedDomain: LinkedDomainPublic | null) {
    this.addDomainLinked = linkedDomain;
  }

  setAddDomainProjectMode(mode: AddDomainProjectMode) {
    this.addDomainProjectMode = mode;
  }

  setAddDomainProjectId(projectId: string) {
    this.addDomainProjectId = projectId;
  }

  setAddDomainMethod(method: LinkedDomainVerificationMethod) {
    this.addDomainMethod = method;
  }

  setAddDomainRecommendations(recommendations: AddDomainMarketRecommendation[]) {
    this.addDomainRecommendations = recommendations;
  }

  setAddDomainSelectedMarketIds(marketIds: string[]) {
    this.addDomainSelectedMarketIds = marketIds;
  }

  toggleAddDomainMarket(marketId: string, selected: boolean) {
    if (selected) {
      if (this.addDomainSelectedMarketIds.includes(marketId)) {
        return;
      }
      this.addDomainSelectedMarketIds = [...this.addDomainSelectedMarketIds, marketId];
      return;
    }
    this.addDomainSelectedMarketIds = this.addDomainSelectedMarketIds.filter(
      (id) => id !== marketId,
    );
  }

  setAddDomainPending(pending: boolean) {
    this.addDomainPending = pending;
  }

  setAddDomainError(error: string | null) {
    this.addDomainError = error;
  }
}
