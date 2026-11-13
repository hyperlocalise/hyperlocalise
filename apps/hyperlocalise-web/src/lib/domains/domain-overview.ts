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

export type DomainOverviewKeyword = {
  keyword: string;
  position?: number;
  volume: number;
  etv: number;
  url?: string;
};

export type DomainOverviewPage = {
  page: string;
  keywordCount: number;
  etv: number;
};

export type DomainOverview = {
  market: { id: string; label: string; location: string; language: string; locationCode: number };
  capturedAt: string;
  organicKeywordCount: number;
  organicEtv: number;
  top10Count: number;
  trackedCount: number;
  improvedCount: number;
  declinedCount: number;
  unchangedCount: number;
  unrankedCount: number;
  topKeywords: DomainOverviewKeyword[];
  topPages: DomainOverviewPage[];
};
