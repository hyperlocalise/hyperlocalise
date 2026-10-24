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

/** Date-only stamp for report freshness. `timeZone` is valid with `dateStyle`. */
const REPORT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeZone: "UTC",
};

/**
 * Date and time with an explicit UTC zone name.
 *
 * Do not combine `dateStyle` / `timeStyle` with `timeZoneName`. V8 throws
 * `TypeError: Invalid option : option` for that mix.
 */
const RERUN_AVAILABLE_AT_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
};

function parseTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function formatReportDate(value: string, locale: string) {
  const date = parseTimestamp(value);
  if (!date) {
    return null;
  }
  // Fixed zone keeps server and client output identical during hydration.
  return date.toLocaleDateString(locale, REPORT_DATE_FORMAT);
}

export function formatRerunAvailableAt(value: string, locale: string) {
  const date = parseTimestamp(value);
  if (!date) {
    return null;
  }
  return date.toLocaleString(locale, RERUN_AVAILABLE_AT_FORMAT);
}
