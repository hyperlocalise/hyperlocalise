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
import type { Metadata } from "next";
import type { MetadataRoute } from "next";

import { DEFAULT_APP_LOCALE, SUPPORTED_APP_LOCALES, type AppLocale } from "@/lib/app-i18n/locales";

import { SITE_URL } from "./site-url";

function normalizeLocalizedPath(path: string): string {
  if (!path || path === "/") {
    return "/";
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

/** Absolute URL for a locale + locale-free path. */
export function getLocalizedAbsoluteUrl(locale: AppLocale, path: string = "/"): string {
  const normalizedPath = normalizeLocalizedPath(path);
  const pathname = normalizedPath === "/" ? `/${locale}` : `/${locale}${normalizedPath}`;
  return `${SITE_URL}${pathname}`;
}

export type LocalizedAlternatesOptions = {
  /** Current page locale (used for `canonical`). */
  locale: AppLocale;
  /** Locale-free path, e.g. `/blog/my-post`. */
  path: string;
  /**
   * Locales that have an equivalent page. Defaults to all supported app locales.
   * Pass a subset for content that is not available in every locale (e.g. a blog post).
   */
  locales?: readonly AppLocale[];
};

function buildLanguageMap(path: string, locales: readonly AppLocale[]): Record<string, string> {
  const languages: Record<string, string> = {};

  for (const appLocale of locales) {
    languages[appLocale] = getLocalizedAbsoluteUrl(appLocale, path);
  }

  if (locales.includes(DEFAULT_APP_LOCALE)) {
    languages["x-default"] = getLocalizedAbsoluteUrl(DEFAULT_APP_LOCALE, path);
  }

  return languages;
}

/**
 * Builds Next.js `metadata.alternates` with a canonical URL and hreflang language map,
 * including `x-default` pointing at the default app locale (English).
 */
export function getLocalizedAlternates({
  locale,
  path,
  locales = SUPPORTED_APP_LOCALES,
}: LocalizedAlternatesOptions): NonNullable<Metadata["alternates"]> {
  return {
    canonical: getLocalizedAbsoluteUrl(locale, path),
    languages: buildLanguageMap(path, locales),
  };
}

/**
 * Language alternate map for a sitemap entry (`alternates.languages`).
 * Same shape as metadata hreflang, including `x-default`.
 */
export function getSitemapLanguageAlternates(
  path: string,
  locales: readonly AppLocale[] = SUPPORTED_APP_LOCALES,
): NonNullable<NonNullable<MetadataRoute.Sitemap[number]["alternates"]>["languages"]> {
  return buildLanguageMap(path, locales);
}
