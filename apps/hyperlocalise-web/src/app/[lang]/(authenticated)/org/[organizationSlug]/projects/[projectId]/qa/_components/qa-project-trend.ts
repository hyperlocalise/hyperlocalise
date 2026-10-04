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

/** Recent successful scans for the trend chart, plus the selected scan when it falls outside that window. */
export function qaTrendReports(
  reports: ProjectQaReport[],
  selectedId: string,
  limit = TREND_SCAN_COUNT,
): ProjectQaReport[] {
  const successful = reports.filter((row) => row.status === "succeeded");
  const recent = successful.slice(0, limit);
  const selected = successful.find((row) => row.id === selectedId);
  if (selected && !recent.some((row) => row.id === selected.id)) {
    recent.push(selected);
  }
  return recent.toReversed();
}
