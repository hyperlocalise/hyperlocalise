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

import { REQUEST_URL_HEADER } from "@/lib/workos/request-url-header";

import {
  APP_LOCALE_COOKIE_NAME,
  APP_LOCALE_HEADER_NAME,
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  type AppLocale,
} from "./locales";

function readRequestHeader(headerList: Headers, name: string): string | null {
  return headerList.get(name.toLowerCase()) ?? headerList.get(name);
}

function getAppLocaleFromRequestUrl(requestUrl: string): AppLocale | null {
  try {
    const firstSegment = new URL(requestUrl).pathname.split("/").filter(Boolean)[0];
    if (!firstSegment) {
      return null;
    }
    return normalizeAppLocale(firstSegment);
  } catch {
    return null;
  }
}

/** Resolves the active app locale from proxy headers, the request URL, then cookies. */
export function resolveAppLocaleFromHeaders(
  headerList: Headers,
  cookieLocale: string | undefined,
): AppLocale {
  const headerLocale = readRequestHeader(headerList, APP_LOCALE_HEADER_NAME);
  if (headerLocale) {
    const normalized = normalizeAppLocale(headerLocale);
    if (normalized) {
      return normalized;
    }
  }

  const requestUrl = readRequestHeader(headerList, REQUEST_URL_HEADER);
  if (requestUrl) {
    const fromPath = getAppLocaleFromRequestUrl(requestUrl);
    if (fromPath) {
      return fromPath;
    }
  }

  if (cookieLocale) {
    const normalized = normalizeAppLocale(cookieLocale);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_APP_LOCALE;
}

export async function getAppLocale(): Promise<AppLocale> {
  const headerList = await headers();
  const cookieStore = await cookies();
  return resolveAppLocaleFromHeaders(headerList, cookieStore.get(APP_LOCALE_COOKIE_NAME)?.value);
}
