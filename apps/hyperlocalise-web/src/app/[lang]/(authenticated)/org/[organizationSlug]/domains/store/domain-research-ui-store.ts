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

export type DomainOverviewTableTab = "keywords" | "pages";

export class DomainResearchUiStore {
  ranksAddOpen = false;
  ranksAddPending = false;
  ranksRefreshPending = false;
  brandAddOpen = false;
  overviewTab: DomainOverviewTableTab = "keywords";
  prompt = "";
  promptMarketId: string | null = null;
  surfaceMarketId: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  syncSurface(marketId: string) {
    if (this.surfaceMarketId === marketId) {
      return;
    }
    this.surfaceMarketId = marketId;
    this.ranksAddOpen = false;
    this.ranksAddPending = false;
    this.ranksRefreshPending = false;
    this.brandAddOpen = false;
    this.overviewTab = "keywords";
  }

  setRanksAddOpen(open: boolean) {
    this.ranksAddOpen = open;
  }

  setRanksAddPending(pending: boolean) {
    this.ranksAddPending = pending;
  }

  setRanksRefreshPending(pending: boolean) {
    this.ranksRefreshPending = pending;
  }

  setBrandAddOpen(open: boolean) {
    this.brandAddOpen = open;
  }

  setOverviewTab(tab: DomainOverviewTableTab) {
    this.overviewTab = tab;
  }

  setPrompt(prompt: string) {
    this.prompt = prompt;
  }

  syncPrompt(marketId: string, catalogPrompt: string) {
    if (this.promptMarketId === marketId) {
      return;
    }
    this.promptMarketId = marketId;
    this.prompt = catalogPrompt;
  }
}
