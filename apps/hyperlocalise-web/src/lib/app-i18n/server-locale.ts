import "server-only";

import { cookies, headers } from "next/headers";

import {
  APP_LOCALE_COOKIE_NAME,
  APP_LOCALE_HEADER_NAME,
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  type AppLocale,
} from "./locales";

export async function getAppLocale(): Promise<AppLocale> {
  const headerList = await headers();
  const headerLocale =
    headerList.get(APP_LOCALE_HEADER_NAME.toLowerCase()) ?? headerList.get(APP_LOCALE_HEADER_NAME);
  if (headerLocale) {
    const normalized = normalizeAppLocale(headerLocale);
    if (normalized) {
      return normalized;
    }
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(APP_LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale) {
    const normalized = normalizeAppLocale(cookieLocale);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_APP_LOCALE;
}
