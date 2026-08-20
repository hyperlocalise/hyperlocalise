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

import {
  automationTimeZoneSearchValue,
  filterAutomationTimeZoneGroups,
  formatAutomationTimeZoneLabel,
  groupAutomationTimeZones,
  isValidAutomationTimeZone,
  listAutomationTimeZones,
} from "./automation-time-zones";

describe("automation time zones", () => {
  it("accepts IANA time zones and rejects free-form labels", () => {
    expect(isValidAutomationTimeZone("UTC")).toBe(true);
    expect(isValidAutomationTimeZone("America/New_York")).toBe(true);
    expect(isValidAutomationTimeZone("Not a zone")).toBe(false);
  });

  it("lists UTC first when grouped and keeps the current value", () => {
    const zones = listAutomationTimeZones("Australia/Sydney");
    expect(zones).toContain("UTC");
    expect(zones).toContain("America/New_York");
    expect(zones).toContain("Australia/Sydney");
    expect(zones.some((zone) => zone.startsWith("Etc/"))).toBe(false);

    const groups = groupAutomationTimeZones(zones);
    expect(groups[0]).toEqual({ id: "UTC", zones: ["UTC"] });
    expect(groups.some((group) => group.id === "Australia")).toBe(true);
  });

  it("formats IANA identifiers for the timezone select", () => {
    expect(formatAutomationTimeZoneLabel("UTC")).toBe("UTC");
    expect(formatAutomationTimeZoneLabel("America/New_York")).toBe("America/New York");
  });

  it("matches timezone search against id, region, and city", () => {
    expect(automationTimeZoneSearchValue("America/New_York")).toContain("America/New York");
    expect(automationTimeZoneSearchValue("America/New_York")).toContain("New York");

    const groups = groupAutomationTimeZones([
      "UTC",
      "America/New_York",
      "America/Los_Angeles",
      "Australia/Sydney",
    ]);

    expect(filterAutomationTimeZoneGroups(groups, "sydney").flatMap((group) => group.zones)).toEqual(
      ["Australia/Sydney"],
    );
    expect(filterAutomationTimeZoneGroups(groups, "york").flatMap((group) => group.zones)).toEqual([
      "America/New_York",
    ]);
    expect(filterAutomationTimeZoneGroups(groups, "america").flatMap((group) => group.zones)).toEqual(
      ["America/Los_Angeles", "America/New_York"],
    );
    expect(filterAutomationTimeZoneGroups(groups, "not-a-zone")).toEqual([]);
  });
});
