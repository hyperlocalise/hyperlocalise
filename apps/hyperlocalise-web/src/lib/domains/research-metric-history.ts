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

export type DomainMetricPoint = { date: string; value: number };
export type DomainMetricHistory = Record<
  "traffic" | "keywords" | "tracked" | "aiMentions",
  DomainMetricPoint[]
>;

// Fixed prototype dates and observations keep stories reproducible. These are not live analytics.
const SAMPLE_DATES = [
  "2026-09-04",
  "2026-09-05",
  "2026-09-06",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
];
function points(values: number[]): DomainMetricPoint[] {
  return values.map((value, index) => ({ date: SAMPLE_DATES[index]!, value }));
}
const SAMPLE_HISTORY: Record<string, DomainMetricHistory> = {
  "hyperlocalise-com": {
    traffic: points([76000, 78200, 77500, 80100, 81700, 82500, 84000]),
    keywords: points([13100, 12900, 13000, 12650, 12500, 12580, 12400]),
    tracked: points([48, 48, 48, 48, 48, 48, 48]),
    aiMentions: points([28, 31, 30, 32, 34, 33, 36]),
  },
};
export function getDomainMetricHistory(linkedDomainId: string): DomainMetricHistory | undefined {
  return SAMPLE_HISTORY[linkedDomainId];
}

export function summarizeMetricHistory(history: readonly DomainMetricPoint[] | undefined) {
  if (!history || history.length < 2) return null;
  const first = history[0]!.value;
  const last = history[history.length - 1]!.value;
  const change = last - first;
  return {
    direction: change > 0 ? ("up" as const) : change < 0 ? ("down" as const) : ("same" as const),
    change,
    percentage: first === 0 ? null : change / first,
  };
}
