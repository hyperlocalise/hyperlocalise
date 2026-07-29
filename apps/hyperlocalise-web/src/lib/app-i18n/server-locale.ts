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
