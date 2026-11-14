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
import type { AppLocale } from "@/lib/app-i18n/locales";
import { isSupportedAppLocale, normalizeAppLocale } from "@/lib/app-i18n/locales";
import {
  USER_APPEARANCE_THEMES,
  USER_HOUR_CYCLES,
  type UserAppearanceTheme,
  type UserHourCycle,
} from "@/lib/database/schema/user-preferences";

export type UserPreferences = {
  theme: UserAppearanceTheme;
  locale: AppLocale;
  timezone: string;
  hourCycle: UserHourCycle;
};

export const USER_PREFERENCES_QUERY_KEY = ["user-preferences"] as const;

export function isUserAppearanceTheme(value: unknown): value is UserAppearanceTheme {
  return typeof value === "string" && USER_APPEARANCE_THEMES.includes(value as UserAppearanceTheme);
}

export function isUserHourCycle(value: unknown): value is UserHourCycle {
  return typeof value === "string" && USER_HOUR_CYCLES.includes(value as UserHourCycle);
}

export function defaultHourCycleForLocale(locale: string): UserHourCycle {
  try {
    const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
    return cycle === "h11" || cycle === "h12" ? "h12" : "h23";
  } catch {
    return "h12";
  }
}

export function detectBrowserTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    return timezone || "UTC";
  } catch {
    return "UTC";
  }
}

export function buildDefaultUserPreferences(locale: AppLocale): UserPreferences {
  return {
    theme: "light",
    locale,
    timezone: detectBrowserTimezone(),
    hourCycle: defaultHourCycleForLocale(locale),
  };
}

export function formattingLocaleForHourCycle(locale: AppLocale, hourCycle: UserHourCycle): string {
  return `${locale}-u-hc-${hourCycle}`;
}

export function parseUserPreferences(value: unknown): UserPreferences | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!isUserAppearanceTheme(record.theme) || !isUserHourCycle(record.hourCycle)) {
    return null;
  }
  if (typeof record.locale !== "string" || !isSupportedAppLocale(record.locale)) {
    return null;
  }
  if (typeof record.timezone !== "string" || record.timezone.trim() === "") {
    return null;
  }

  const locale = normalizeAppLocale(record.locale);
  if (!locale) {
    return null;
  }

  return {
    theme: record.theme,
    locale,
    timezone: record.timezone.trim(),
    hourCycle: record.hourCycle,
  };
}
