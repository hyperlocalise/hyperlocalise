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
import { describe, expect, it } from "vite-plus/test";
import { getDomainMetricHistory, summarizeMetricHistory } from "./research-metric-history";
import { getResearchPrototypeDomain } from "./research-prototype";
describe("domain metric history", () => {
  it("distinguishes missing observations from no change", () => {
    expect(summarizeMetricHistory(undefined)).toBeNull();
    expect(summarizeMetricHistory([])).toBeNull();
    expect(summarizeMetricHistory([{ date: "2026-09-10", value: 0 }])).toBeNull();
    expect(
      summarizeMetricHistory(getDomainMetricHistory("hyperlocalise-com")!.tracked)?.direction,
    ).toBe("same");
  });
  it("compares first and last observations for rising and falling metrics", () => {
    const history = getDomainMetricHistory("hyperlocalise-com")!;
    expect(summarizeMetricHistory(history.traffic)).toEqual({
      direction: "up",
      change: 8000,
      percentage: 8000 / 76000,
    });
    expect(summarizeMetricHistory(history.keywords)?.direction).toBe("down");
  });
  it("uses an absolute change when the baseline is zero", () => {
    expect(
      summarizeMetricHistory([
        { date: "2026-09-04", value: 0 },
        { date: "2026-09-10", value: 6 },
      ]),
    ).toEqual({ direction: "up", change: 6, percentage: null });
  });
  it("ends each seven-day fixture at the current domain value", () => {
    const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
    const history = getDomainMetricHistory(domain.id)!;
    const current = {
      traffic: domain.traffic,
      keywords: domain.keywordCount,
      tracked: domain.trackedCount,
      aiMentions: domain.aiMentions,
    };
    for (const key of Object.keys(history) as (keyof typeof history)[]) {
      expect(history[key]).toHaveLength(7);
      expect(history[key].at(-1)?.value).toBe(current[key]);
    }
    expect(getDomainMetricHistory("help-acme-com")).toBeUndefined();
  });
});
