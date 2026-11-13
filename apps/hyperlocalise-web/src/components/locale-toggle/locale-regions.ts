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
import { SUPPORTED_APP_LOCALES, type AppLocale } from "@/lib/app-i18n/locales";
import { getAppLocaleFlagEmoji } from "@/lib/app-i18n/rewrite-app-locale-path";

export const APP_LOCALE_REGION_GROUPS = ["americas", "asia-pacific", "europe"] as const;

export type AppLocaleRegionGroup = (typeof APP_LOCALE_REGION_GROUPS)[number];

const APP_LOCALE_REGIONS = {
  en: { group: "americas", countryCode: "US" },
  "zh-CN": { group: "asia-pacific", countryCode: "CN" },
  "da-DK": { group: "europe", countryCode: "DK" },
  "nl-NL": { group: "europe", countryCode: "NL" },
  "fil-PH": { group: "asia-pacific", countryCode: "PH" },
  "fr-FR": { group: "europe", countryCode: "FR" },
  "de-DE": { group: "europe", countryCode: "DE" },
  "ja-JP": { group: "asia-pacific", countryCode: "JP" },
  "ko-KR": { group: "asia-pacific", countryCode: "KR" },
  "th-TH": { group: "asia-pacific", countryCode: "TH" },
  "vi-VN": { group: "asia-pacific", countryCode: "VN" },
} as const satisfies Record<AppLocale, { group: AppLocaleRegionGroup; countryCode: string }>;

export type LocalePickerEntry = {
  locale: AppLocale;
  group: AppLocaleRegionGroup;
  flag: string;
  /** Country name written in the locale's own language, e.g. "Deutschland". */
  nativeCountry: string;
  /** Language name written in the locale's own language, e.g. "Deutsch". */
  nativeLanguage: string;
  searchText: string;
};

export type LocalePickerGroup = {
  group: AppLocaleRegionGroup;
  entries: LocalePickerEntry[];
};

const DIACRITICS_PATTERN = /\p{Diacritic}/gu;

export function normalizeLocaleSearchText(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS_PATTERN, "").toLowerCase().trim();
}

function displayName(
  displayLocale: string,
  type: "language" | "region",
  code: string,
): string | undefined {
  try {
    return new Intl.DisplayNames([displayLocale], { type }).of(code);
  } catch {
    return undefined;
  }
}

function capitalizeFirst(value: string, locale: string): string {
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

/**
 * Builds picker entries with names in each locale's own language, plus the
 * names in `uiLocale` so people can search in whatever language they read.
 */
export function buildLocalePickerEntries(uiLocale: string): LocalePickerEntry[] {
  return SUPPORTED_APP_LOCALES.map((locale) => {
    const { group, countryCode } = APP_LOCALE_REGIONS[locale];
    const languageCode = locale.split("-")[0];
    const nativeLanguage = capitalizeFirst(
      displayName(locale, "language", languageCode) ?? locale,
      locale,
    );
    const nativeCountry = displayName(locale, "region", countryCode) ?? countryCode;
    const searchText = normalizeLocaleSearchText(
      [
        nativeLanguage,
        nativeCountry,
        displayName(uiLocale, "language", languageCode),
        displayName(uiLocale, "region", countryCode),
        locale,
      ]
        .filter(Boolean)
        .join(" "),
    );

    return {
      locale,
      group,
      flag: getAppLocaleFlagEmoji(locale),
      nativeCountry,
      nativeLanguage,
      searchText,
    };
  });
}

export function groupLocalePickerEntries(
  entries: readonly LocalePickerEntry[],
  query: string,
): LocalePickerGroup[] {
  const normalizedQuery = normalizeLocaleSearchText(query);
  const matches = normalizedQuery
    ? entries.filter((entry) => entry.searchText.includes(normalizedQuery))
    : entries;

  return APP_LOCALE_REGION_GROUPS.flatMap((group) => {
    const groupEntries = matches.filter((entry) => entry.group === group);
    return groupEntries.length > 0 ? [{ group, entries: groupEntries }] : [];
  });
}
