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
import { isErr, ok, type Result } from "@/lib/primitives/result/results";

import { GSC_DEFAULT_DATE_RANGE, type GscDateRange, gscCountryForMarket } from "./constants";
import { matchSearchConsoleSite } from "./match-site";
import {
  pageRowsFromGsc,
  queryRowsFromGsc,
  seriesFromDateRows,
  summarizeGscRows,
} from "./performance";
import { loadGscPipesAccessToken } from "./pipes";
import { getGscProvider } from "./provider";
import type { GscConnectionSummary, GscPerformanceSnapshot, GscProviderError } from "./types";

export type LoadSearchConsolePerformanceError = GscProviderError;

const CONNECTED: GscConnectionSummary = {
  connected: true,
  needsReauthorization: false,
};

function emptySnapshot(
  dateRange: GscDateRange,
  status: GscPerformanceSnapshot["status"],
  connection: GscConnectionSummary | null,
): GscPerformanceSnapshot {
  return {
    status,
    connection,
    siteUrl: null,
    startDate: null,
    endDate: null,
    dateRange,
    totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    series: [],
    queries: [],
    pages: [],
  };
}

export async function loadSearchConsolePerformance(input: {
  organizationId: string;
  workosUserId: string;
  domainKey: string;
  dateRange?: GscDateRange;
  marketId?: string | null;
  cookie?: string;
  signal?: AbortSignal;
}): Promise<Result<GscPerformanceSnapshot, LoadSearchConsolePerformanceError>> {
  const dateRange = input.dateRange ?? GSC_DEFAULT_DATE_RANGE;

  const minted = await loadGscPipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(minted)) {
    if (minted.error.code === "gsc_pipes_unavailable") {
      return ok(emptySnapshot(dateRange, "unconfigured", null));
    }
    if (minted.error.code === "gsc_pipes_needs_reauthorization") {
      return ok(
        emptySnapshot(dateRange, "needs_reauthorization", {
          connected: false,
          needsReauthorization: true,
        }),
      );
    }
    return ok(emptySnapshot(dateRange, "disconnected", null));
  }

  const provider = getGscProvider();
  const sites = await provider.listSites({
    accessToken: minted.value,
    cookie: input.cookie,
    signal: input.signal,
  });
  if (isErr(sites)) {
    return sites;
  }

  const site = matchSearchConsoleSite(sites.value, input.domainKey);
  if (!site) {
    return ok({
      ...emptySnapshot(dateRange, "no_property", CONNECTED),
    });
  }

  const country = gscCountryForMarket(input.marketId);
  const [seriesResult, queryResult, pageResult] = await Promise.all([
    provider.queryPerformance({
      accessToken: minted.value,
      siteUrl: site.siteUrl,
      dateRange,
      dimensions: ["date"],
      country,
      cookie: input.cookie,
      signal: input.signal,
    }),
    provider.queryPerformance({
      accessToken: minted.value,
      siteUrl: site.siteUrl,
      dateRange,
      dimensions: ["query"],
      country,
      rowLimit: 25,
      cookie: input.cookie,
      signal: input.signal,
    }),
    provider.queryPerformance({
      accessToken: minted.value,
      siteUrl: site.siteUrl,
      dateRange,
      dimensions: ["page"],
      country,
      rowLimit: 25,
      cookie: input.cookie,
      signal: input.signal,
    }),
  ]);

  if (isErr(seriesResult)) {
    return seriesResult;
  }
  if (isErr(queryResult)) {
    return queryResult;
  }
  if (isErr(pageResult)) {
    return pageResult;
  }

  return ok({
    status: "ready",
    connection: CONNECTED,
    siteUrl: site.siteUrl,
    startDate: seriesResult.value.startDate || null,
    endDate: seriesResult.value.endDate || null,
    dateRange,
    totals: summarizeGscRows(seriesResult.value.rows),
    series: seriesFromDateRows(seriesResult.value.rows),
    queries: queryRowsFromGsc(queryResult.value.rows),
    pages: pageRowsFromGsc(pageResult.value.rows),
  });
}
