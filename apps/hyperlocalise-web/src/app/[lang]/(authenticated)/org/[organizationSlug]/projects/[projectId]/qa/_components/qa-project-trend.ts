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
import type { ProjectQaReport } from "@/lib/qa/qa-report-client";

const TREND_SCAN_COUNT = 10;

/**
 * A contiguous window of successful scans for the trend chart. Keeps the latest
 * runs when the selection is among them; otherwise slides so the selected scan
 * stays in sequence with its neighbors.
 */
export function qaTrendReports(
  reports: ProjectQaReport[],
  selectedId: string,
  limit = TREND_SCAN_COUNT,
): ProjectQaReport[] {
  const successful = reports.filter((row) => row.status === "succeeded");
  const selectedIndex = successful.findIndex((row) => row.id === selectedId);
  const start = selectedIndex >= limit ? selectedIndex - (limit - 1) : 0;
  return successful.slice(start, start + limit).toReversed();
}
