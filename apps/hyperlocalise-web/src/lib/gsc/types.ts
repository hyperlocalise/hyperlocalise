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

import type { GscDateRange } from "./constants";

export type GscConnectionSummary = {
  id: string;
  organizationId: string;
  accountEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type GscSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscSearchAnalyticsRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscMetricPoint = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscIndexStatus = {
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  pageFetchState?: string;
  googleCanonical?: string;
  userCanonical?: string;
  crawledAs?: string;
};

export type GscInspection = {
  indexStatusResult?: GscIndexStatus;
  mobileUsabilityResult?: { verdict?: string };
  richResultsResult?: { verdict?: string };
  inspectionResultLink?: string;
};

export type GscPerformanceSnapshot = {
  status: "ready" | "disconnected" | "unconfigured" | "no_property" | "sample";
  connection: GscConnectionSummary | null;
  siteUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  dateRange: GscDateRange;
  totals: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  series: GscMetricPoint[];
  queries: GscQueryRow[];
  pages: GscPageRow[];
};

export type GscConnectionError =
  | { code: "gsc_not_configured"; message: string }
  | { code: "gsc_connection_not_found"; message: string }
  | { code: "gsc_connection_decrypt_failed"; message: string }
  | { code: "gsc_oauth_exchange_failed"; message: string }
  | { code: "gsc_oauth_invalid"; message: string }
  | { code: "gsc_refresh_failed"; message: string };

export type GscProviderError = {
  code:
    | "gsc_not_configured"
    | "gsc_connection_not_found"
    | "gsc_auth_failed"
    | "gsc_rate_limited"
    | "gsc_not_found"
    | "gsc_validation_error"
    | "gsc_upstream_unavailable"
    | "gsc_api_error"
    | "provider_unavailable";
  message: string;
};
