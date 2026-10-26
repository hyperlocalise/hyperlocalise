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

import { addDays, daysBetween, describeChange, resolvePeriod, shareOf } from "./report-period";

describe("report periods", () => {
  it("defaults to the last 28 days, compared with the 28 before", () => {
    expect(resolvePeriod({ today: "2026-10-21", startedDay: "2026-01-01" })).toEqual({
      from: "2026-09-24",
      to: "2026-10-21",
      days: 28,
      previousFrom: "2026-08-27",
      previousTo: "2026-09-23",
      interval: "day",
      hasEarlierData: true,
    });
  });

  it("never runs past today, and charts long periods by week", () => {
    const period = resolvePeriod({
      from: "2026-07-24",
      to: "2026-12-31",
      today: "2026-10-21",
      startedDay: "2026-01-01",
    });
    expect(period).toMatchObject({ to: "2026-10-21", days: 90, interval: "week" });
    expect(
      resolvePeriod({
        from: "2026-09-01",
        to: "2026-10-15",
        today: "2026-10-21",
        startedDay: null,
      }),
    ).toMatchObject({ days: 45, interval: "day", hasEarlierData: false });
  });

  it("has no earlier data when the previous period starts before Reports did", () => {
    expect(resolvePeriod({ today: "2026-10-21", startedDay: "2026-08-28" }).hasEarlierData).toBe(
      false,
    );
    expect(resolvePeriod({ today: "2026-10-21", startedDay: "2026-08-27" }).hasEarlierData).toBe(
      true,
    );
  });

  it("counts days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-12-25", "2027-01-07")).toBe(14);
  });

  it("describes changes as a percentage, a difference from zero, or points of a share", () => {
    const base = { hasEarlierData: true };
    expect(describeChange({ ...base, current: 118, previous: 100 })).toEqual({
      kind: "percent",
      value: 18,
    });
    expect(describeChange({ ...base, current: 40, previous: 0 })).toEqual({
      kind: "difference",
      value: 40,
    });
    expect(describeChange({ ...base, current: 0.86, previous: 0.82, share: true })).toEqual({
      kind: "points",
      value: 4,
    });
    expect(describeChange({ ...base, current: null, previous: 0.5, share: true })).toEqual({
      kind: "unavailable",
    });
    expect(describeChange({ current: 5, previous: 1, hasEarlierData: false })).toEqual({
      kind: "no_earlier_data",
    });
    expect(shareOf(3, 0)).toBeNull();
    expect(shareOf(3, 4)).toBe(0.75);
  });
});
