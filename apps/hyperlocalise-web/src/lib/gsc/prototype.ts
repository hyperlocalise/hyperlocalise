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

import { GSC_DEFAULT_DATE_RANGE } from "./constants";
import type { GscPerformanceSnapshot } from "./types";

export function getPrototypeSearchConsoleSnapshot(domainKey: string): GscPerformanceSnapshot {
  const series = [
    { date: "2026-08-17", clicks: 84, impressions: 2100, ctr: 0.04, position: 12.4 },
    { date: "2026-08-24", clicks: 97, impressions: 2280, ctr: 0.0425, position: 11.8 },
    { date: "2026-08-31", clicks: 112, impressions: 2460, ctr: 0.0455, position: 11.1 },
    { date: "2026-09-07", clicks: 128, impressions: 2610, ctr: 0.049, position: 10.4 },
  ];

  return {
    status: "sample",
    connection: {
      id: "prototype-gsc",
      organizationId: "prototype",
      accountEmail: "seo@example.com",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    siteUrl: `sc-domain:${domainKey}`,
    startDate: "2026-08-17",
    endDate: "2026-09-13",
    dateRange: GSC_DEFAULT_DATE_RANGE,
    totals: {
      clicks: 421,
      impressions: 9450,
      ctr: 0.0446,
      position: 11.4,
    },
    series,
    queries: [
      {
        query: "traduction automatique",
        clicks: 86,
        impressions: 1900,
        ctr: 0.045,
        position: 18.2,
      },
      {
        query: "logiciel de traduction",
        clicks: 64,
        impressions: 980,
        ctr: 0.065,
        position: 8.1,
      },
      {
        query: "traduction IA",
        clicks: 41,
        impressions: 740,
        ctr: 0.055,
        position: 12.6,
      },
    ],
    pages: [
      {
        page: `https://${domainKey}/fr`,
        clicks: 148,
        impressions: 3200,
        ctr: 0.046,
        position: 9.4,
      },
      {
        page: `https://${domainKey}/fr/product`,
        clicks: 92,
        impressions: 1680,
        ctr: 0.055,
        position: 7.8,
      },
    ],
  };
}
