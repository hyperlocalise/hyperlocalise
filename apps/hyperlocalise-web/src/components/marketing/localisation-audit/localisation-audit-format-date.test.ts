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

import { formatReportDate, formatRerunAvailableAt } from "./localisation-audit-format-date";

const TIMESTAMP = "2026-08-01T12:00:00.000Z";

describe("localisation audit date formatters", () => {
  it("rejects mixing dateStyle/timeStyle with timeZoneName", () => {
    expect(() =>
      new Date(TIMESTAMP).toLocaleString("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
        timeZoneName: "short",
      }),
    ).toThrow(/Invalid option/);
  });

  it("formats report freshness in UTC without throwing", () => {
    expect(formatReportDate(TIMESTAMP, "en")).toBe("Aug 1, 2026");
  });

  it("formats rerun availability with a UTC zone name", () => {
    const formatted = formatRerunAvailableAt(TIMESTAMP, "en");

    expect(formatted).toContain("Aug");
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/UTC|GMT/i);
  });

  it("returns null for invalid timestamps", () => {
    expect(formatReportDate("not-a-date", "en")).toBeNull();
    expect(formatRerunAvailableAt("not-a-date", "en")).toBeNull();
  });
});
