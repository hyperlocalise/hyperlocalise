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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { GSC_DEFAULT_DATE_RANGE, type GscDateRange, gscCountryForMarket } from "./constants";
import { getGscConnection, isGscOAuthConfigured, mintGscAccessToken } from "./connections";
import { matchSearchConsoleSite } from "./match-site";
import { pageRowsFromGsc, queryRowsFromGsc, seriesFromDateRows, summarizeGscRows } from "./performance";
import { getGscProvider } from "./provider";
import type { GscPerformanceSnapshot, GscProviderError } from "./types";

export type LoadSearchConsolePerformanceError = GscProviderError;

export async function loadSearchConsolePerformance(input: {
  organizationId: string;
  domainKey: string;
  dateRange?: GscDateRange;
  marketId?: string | null;
  cookie?: string;
  signal?: AbortSignal;
}): Promise<Result<GscPerformanceSnapshot, LoadSearchConsolePerformanceError>> {
  const dateRange = input.dateRange ?? GSC_DEFAULT_DATE_RANGE;
  const empty: Omit<GscPerformanceSnapshot, "status" | "connection" | "siteUrl"> = {
    startDate: null,
    endDate: null,
    dateRange,
    totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    series: [],
    queries: [],
    pages: [],
  };

  if (!isGscOAuthConfigured()) {
    return ok({
      ...empty,
      status: "unconfigured",
      connection: null,
      siteUrl: null,
    });
  }

  const connection = await getGscConnection({ organizationId: input.organizationId });
  if (!connection) {
    return ok({
      ...empty,
      status: "disconnected",
      connection: null,
      siteUrl: null,
    });
  }

  const minted = await mintGscAccessToken({
    organizationId: input.organizationId,
    signal: input.signal,
  });
  if (isErr(minted)) {
    return err({
      code: minted.error.code === "gsc_refresh_failed" ? "gsc_auth_failed" : "gsc_auth_failed",
      message: minted.error.message,
    });
  }

  const provider = getGscProvider();
  const sites = await provider.listSites({
    accessToken: minted.value.accessToken,
    cookie: input.cookie,
    signal: input.signal,
  });
  if (isErr(sites)) {
    return sites;
  }

  const site = matchSearchConsoleSite(sites.value, input.domainKey);
  if (!site) {
    return ok({
      ...empty,
      status: "no_property",
      connection,
      siteUrl: null,
    });
  }

  const country = gscCountryForMarket(input.marketId);
  const [seriesResult, queryResult, pageResult] = await Promise.all([
    provider.queryPerformance({
      accessToken: minted.value.accessToken,
      siteUrl: site.siteUrl,
      dateRange,
      dimensions: ["date"],
      country,
      cookie: input.cookie,
      signal: input.signal,
    }),
    provider.queryPerformance({
      accessToken: minted.value.accessToken,
      siteUrl: site.siteUrl,
      dateRange,
      dimensions: ["query"],
      country,
      rowLimit: 25,
      cookie: input.cookie,
      signal: input.signal,
    }),
    provider.queryPerformance({
      accessToken: minted.value.accessToken,
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
    connection,
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
