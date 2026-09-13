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

import type { GscMetricPoint, GscPageRow, GscQueryRow, GscSearchAnalyticsRow } from "./types";

export function emptyGscTotals() {
  return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

export function summarizeGscRows(rows: GscSearchAnalyticsRow[]) {
  const totals = emptyGscTotals();
  if (rows.length === 0) {
    return totals;
  }

  for (const row of rows) {
    totals.clicks += row.clicks;
    totals.impressions += row.impressions;
    totals.position += row.position * row.impressions;
  }
  totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  totals.position = totals.impressions > 0 ? totals.position / totals.impressions : 0;
  return totals;
}

export function seriesFromDateRows(rows: GscSearchAnalyticsRow[]): GscMetricPoint[] {
  return rows
    .map((row) => ({
      date: row.keys?.[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .filter((row) => row.date.length > 0);
}

export function queryRowsFromGsc(rows: GscSearchAnalyticsRow[]): GscQueryRow[] {
  return rows
    .map((row) => ({
      query: row.keys?.[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .filter((row) => row.query.length > 0);
}

export function pageRowsFromGsc(rows: GscSearchAnalyticsRow[]): GscPageRow[] {
  return rows
    .map((row) => ({
      page: row.keys?.[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .filter((row) => row.page.length > 0);
}
