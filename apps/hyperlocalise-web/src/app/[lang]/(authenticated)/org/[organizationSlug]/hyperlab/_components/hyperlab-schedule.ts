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

export const HYPERLAB_TIMEZONES = [
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Bangkok", label: "Bangkok" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Australia/Melbourne", label: "Melbourne" },
  { value: "Pacific/Auckland", label: "Auckland" },
  { value: "UTC", label: "UTC" },
] as const;

export function timezoneSelectItems(selected: string): Array<{ value: string; label: string }> {
  const items: Array<{ value: string; label: string }> = HYPERLAB_TIMEZONES.map((item) => ({
    value: item.value,
    label: item.label,
  }));
  if (selected && !items.some((item) => item.value === selected)) {
    items.unshift({ value: selected, label: selected.replaceAll("_", " ") });
  }
  return items;
}

export type HyperlabTimezone = (typeof HYPERLAB_TIMEZONES)[number]["value"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseGmtOffsetMinutes(label: string): number {
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(label);
  if (!match) {
    return 0;
  }
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function offsetMinutesForInstant(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(instant);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  return parseGmtOffsetMinutes(name);
}

export type WallTimeStatus = "ok" | "ambiguous" | "nonexistent" | "invalid";

export type WallTimeResult = {
  status: WallTimeStatus;
  iso: string | null;
};

function wallTimeInstants(date: string, time: string, timeZone: string): Date[] {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every((value) => Number.isFinite(value))) {
    return [];
  }
  const wallTime = `${pad(hour)}:${pad(minute)}`;
  const offsets = new Set<number>();
  for (const probeHour of [0, 3, 6, 9, 12, 15, 18, 21]) {
    offsets.add(
      offsetMinutesForInstant(new Date(Date.UTC(year, month - 1, day, probeHour, 0, 0)), timeZone),
    );
  }
  const instants: Date[] = [];
  const seen = new Set<number>();
  for (const offsetMin of offsets) {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMin * 60_000;
    if (seen.has(utcMs)) {
      continue;
    }
    const wall = isoToWallTime(new Date(utcMs).toISOString(), timeZone);
    if (wall.date === date && wall.time === wallTime) {
      seen.add(utcMs);
      instants.push(new Date(utcMs));
    }
  }
  return instants.sort((left, right) => left.getTime() - right.getTime());
}

export function inspectWallTime(date: string, time: string, timeZone: string): WallTimeResult {
  if (!date || !time || !timeZone) {
    return { status: "invalid", iso: null };
  }
  const instants = wallTimeInstants(date, time, timeZone);
  if (instants.length === 0) {
    return { status: "nonexistent", iso: null };
  }
  return {
    status: instants.length > 1 ? "ambiguous" : "ok",
    iso: instants[0].toISOString(),
  };
}

export function wallTimeToIso(date: string, time: string, timeZone: string): string {
  const result = inspectWallTime(date, time, timeZone);
  if (!result.iso) {
    throw new Error("That local time does not exist in the selected timezone");
  }
  return result.iso;
}

export function equalVariantRollouts(count: number): number[] {
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(10000 / count);
  const remainder = 10000 % count;
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? base + remainder : base,
  );
}

export function isoToWallTime(iso: string, timeZone: string): { date: string; time: string } {
  const instant = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function addMonthsIsoDate(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + months, day));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function todayIsoDate(timeZone: string): string {
  return isoToWallTime(new Date().toISOString(), timeZone).date;
}

export function formatScheduleRange(
  startAt: string,
  endAt: string,
  timeZone: string,
  locale: string,
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startAt))} – ${formatter.format(new Date(endAt))}`;
}

export function isScheduleExpired(endAt: string): boolean {
  return new Date(endAt).getTime() < Date.now();
}

export function rolloutToPercent(value: number): number {
  return Math.round((value / 100) * 100) / 100;
}

export function percentToRollout(value: number): number {
  const clamped = Math.min(Math.max(value, 0), 100);
  return Math.round(clamped * 100);
}
