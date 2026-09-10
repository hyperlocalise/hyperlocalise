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
import { expect, test } from "vite-plus/test";

import {
  addMonthsIsoDate,
  equalVariantRollouts,
  inspectWallTime,
  isoToWallTime,
  percentToRollout,
  rolloutToPercent,
  timezoneSelectItems,
  wallTimeToIso,
} from "./hyperlab-schedule";

test("converts Tokyo wall time to UTC", () => {
  const iso = wallTimeToIso("2026-09-10", "09:00", "Asia/Tokyo");
  expect(iso).toBe("2026-09-10T00:00:00.000Z");
});

test("round-trips Sydney wall time", () => {
  const iso = wallTimeToIso("2026-01-15", "17:30", "Australia/Sydney");
  const wall = isoToWallTime(iso, "Australia/Sydney");
  expect(wall).toEqual({ date: "2026-01-15", time: "17:30" });
});

test("adds months across year boundaries", () => {
  expect(addMonthsIsoDate("2026-11-10", 3)).toBe("2027-02-10");
});

test("converts rollout scale to percent", () => {
  expect(rolloutToPercent(5000)).toBe(50);
  expect(percentToRollout(25)).toBe(2500);
  expect(percentToRollout(100)).toBe(10000);
});

test("keeps a timezone that is not in the common list", () => {
  const items = timezoneSelectItems("Asia/Ho_Chi_Minh");
  expect(items[0]).toEqual({ value: "Asia/Ho_Chi_Minh", label: "Asia/Ho Chi Minh" });
});

test("rejects a spring-forward gap", () => {
  expect(inspectWallTime("2026-03-08", "02:30", "America/Los_Angeles")).toEqual({
    status: "nonexistent",
    iso: null,
  });
  expect(() => wallTimeToIso("2026-03-08", "02:30", "America/Los_Angeles")).toThrow(
    /does not exist/,
  );
});

test("uses the earlier occurrence for an ambiguous fall-back time", () => {
  const result = inspectWallTime("2026-11-01", "01:30", "America/Los_Angeles");
  expect(result.status).toBe("ambiguous");
  expect(result.iso).toBe("2026-11-01T08:30:00.000Z");
  expect(isoToWallTime(result.iso ?? "", "America/Los_Angeles")).toEqual({
    date: "2026-11-01",
    time: "01:30",
  });
});

test("splits traffic evenly across versions", () => {
  expect(equalVariantRollouts(2)).toEqual([5000, 5000]);
  expect(equalVariantRollouts(3)).toEqual([3333, 3333, 3334]);
});
