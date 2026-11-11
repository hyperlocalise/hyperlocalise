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
/**
 * The dates a Reports section covers, and the period of the same length just before them that
 * its headline numbers are compared with. Days are UTC calendar days, as `YYYY-MM-DD`.
 */

export const REPORT_PRESET_DAYS = [7, 28, 90] as const;
export const DEFAULT_REPORT_DAYS = 28;
/** Periods longer than this are charted week by week rather than day by day. */
export const WEEKLY_ABOVE_DAYS = 45;

const DAY_MS = 86_400_000;

export type ReportPeriod = {
  from: string;
  to: string;
  days: number;
  previousFrom: string;
  previousTo: string;
  interval: "day" | "week";
  /** The previous period starts on or after the day Reports started, so it can be compared. */
  hasEarlierData: boolean;
};

export type ReportChange =
  | { kind: "no_earlier_data" }
  | { kind: "unavailable" }
  /** The previous value was 0, so the change is the plain difference. */
  | { kind: "difference"; value: number }
  | { kind: "percent"; value: number }
  /** A change in a share, in percentage points. */
  | { kind: "points"; value: number };

export function addDays(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}

/** The number of days from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/**
 * The period to report on: the last 28 days by default, never past today. `startedDay` is the
 * UTC day Reports started for the workspace, or null when it has recorded nothing yet.
 */
export function resolvePeriod(input: {
  from?: string;
  to?: string;
  today: string;
  startedDay: string | null;
}): ReportPeriod {
  const to = input.to && input.to < input.today ? input.to : input.today;
  const requestedFrom = input.from ?? addDays(to, -(DEFAULT_REPORT_DAYS - 1));
  const from = requestedFrom > to ? to : requestedFrom;
  const days = daysBetween(from, to);
  const previousFrom = addDays(from, -days);
  return {
    from,
    to,
    days,
    previousFrom,
    previousTo: addDays(from, -1),
    interval: days > WEEKLY_ABOVE_DAYS ? "week" : "day",
    hasEarlierData: input.startedDay !== null && previousFrom >= input.startedDay,
  };
}

/**
 * How a headline number changed against the previous period. Counts change by a percentage, or
 * by the plain difference when the previous count was 0; shares (`share: true`, as fractions)
 * change by percentage points.
 */
export function describeChange(input: {
  current: number | null;
  previous: number | null;
  hasEarlierData: boolean;
  share?: boolean;
}): ReportChange {
  if (!input.hasEarlierData) return { kind: "no_earlier_data" };
  if (input.current === null || input.previous === null) return { kind: "unavailable" };
  if (input.share)
    return { kind: "points", value: Math.round((input.current - input.previous) * 100) };
  if (input.previous === 0) return { kind: "difference", value: input.current };
  return {
    kind: "percent",
    value: Math.round(((input.current - input.previous) / input.previous) * 100),
  };
}

/** A share of two counts, or null when there is nothing to take a share of. */
export function shareOf(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
