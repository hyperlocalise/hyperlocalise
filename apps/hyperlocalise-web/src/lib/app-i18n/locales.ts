import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import type { NextRequest } from "next/server";

export const SUPPORTED_APP_LOCALES = ["en"] as const;

/**
 * Locales with message catalogs and/or blog posts ready to serve.
 * Keep this ahead of SUPPORTED_APP_LOCALES so enabling a locale is a one-line change.
 */
export const AVAILABLE_APP_CONTENT_LOCALES = ["en", "zh-CN", "vi-VN", "de-DE", "fr-FR"] as const;

export type AppLocale = (typeof SUPPORTED_APP_LOCALES)[number];
export type AppContentLocale = (typeof AVAILABLE_APP_CONTENT_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = "en";
export const APP_LOCALE_COOKIE_NAME = "hl_locale";
export const APP_LOCALE_HEADER_NAME = "X-Locale";

export function isSupportedAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    SUPPORTED_APP_LOCALES.some((locale) => locale.toLowerCase() === value.toLowerCase())
  );
}

export function isAvailableAppContentLocale(value: unknown): value is AppContentLocale {
  return (
    typeof value === "string" &&
    AVAILABLE_APP_CONTENT_LOCALES.some((locale) => locale.toLowerCase() === value.toLowerCase())
  );
}

export function normalizeAppLocale(value: string): AppLocale | null {
  const locale = SUPPORTED_APP_LOCALES.find(
    (supportedLocale) => supportedLocale.toLowerCase() === value.toLowerCase(),
  );

  return locale ?? null;
}

export function normalizeAppContentLocale(value: string): AppContentLocale | null {
  const locale = AVAILABLE_APP_CONTENT_LOCALES.find(
    (contentLocale) => contentLocale.toLowerCase() === value.toLowerCase(),
  );

  return locale ?? null;
}

export function getAppLocaleFromRequest(request: NextRequest): AppLocale {
  const cookieLocale = request.cookies.get(APP_LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && isSupportedAppLocale(cookieLocale)) {
    return normalizeAppLocale(cookieLocale) ?? DEFAULT_APP_LOCALE;
  }

  const acceptLanguageHeader = request.headers.get("accept-language") ?? DEFAULT_APP_LOCALE;
  const languages = new Negotiator({
    headers: { "accept-language": acceptLanguageHeader },
  }).languages();

  try {
    const matchedLocale = match(languages, SUPPORTED_APP_LOCALES, DEFAULT_APP_LOCALE);
    return normalizeAppLocale(matchedLocale) ?? DEFAULT_APP_LOCALE;
  } catch {
    return DEFAULT_APP_LOCALE;
  }
}
