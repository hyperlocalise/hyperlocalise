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

const FALLBACK_AUTOMATION_TIME_ZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Stockholm",
  "Pacific/Auckland",
] as const;

export type AutomationTimeZoneGroup = {
  id: string;
  zones: string[];
};

export function isValidAutomationTimeZone(timeZone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function supportedTimeZones() {
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    return Intl.supportedValuesOf("timeZone");
  }

  return [...FALLBACK_AUTOMATION_TIME_ZONES];
}

export function listAutomationTimeZones(include?: string) {
  const zones = new Set<string>(["UTC"]);

  for (const zone of supportedTimeZones()) {
    if (zone === "UTC" || zone.startsWith("Etc/")) {
      continue;
    }
    zones.add(zone);
  }

  const extra = include?.trim();
  if (extra) {
    zones.add(extra);
  }

  return [...zones];
}

export function groupAutomationTimeZones(timeZones: string[]): AutomationTimeZoneGroup[] {
  const groups = new Map<string, string[]>();
  const utc: string[] = [];

  for (const zone of timeZones.toSorted((left, right) => left.localeCompare(right))) {
    if (zone === "UTC") {
      utc.push(zone);
      continue;
    }

    const separator = zone.indexOf("/");
    const region = separator === -1 ? "Other" : zone.slice(0, separator);
    const list = groups.get(region) ?? [];
    list.push(zone);
    groups.set(region, list);
  }

  const grouped = [...groups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([id, zones]) => ({ id, zones }));

  return utc.length > 0 ? [{ id: "UTC", zones: utc }, ...grouped] : grouped;
}

export function formatAutomationTimeZoneLabel(timeZone: string) {
  if (timeZone === "UTC") {
    return "UTC";
  }

  return timeZone.replaceAll("_", " ");
}
