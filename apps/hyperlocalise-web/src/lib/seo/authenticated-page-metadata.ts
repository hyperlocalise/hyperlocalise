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

import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";

import {
  AUTHENTICATED_TITLE_TEMPLATE,
  getAuthenticatedRouteMetadata,
  type AuthenticatedPageKey,
} from "./authenticated-route-metadata";
import { PRIVATE_ROBOTS } from "./robots-metadata";

export type AuthenticatedPageMetadataOptions = {
  /**
   * When true, appends ` | Hyperlocalise` to the title. Use for routes that
   * sit outside the authenticated layout title template (auth flow pages).
   */
  includeBrandSuffix?: boolean;
};

export function getAuthenticatedPageMetadata(
  locale: string,
  page: AuthenticatedPageKey,
  options?: AuthenticatedPageMetadataOptions,
): Metadata {
  const normalizedLocale = normalizeAppLocale(locale) ?? DEFAULT_APP_LOCALE;
  const copy = getAuthenticatedRouteMetadata(getIntlShape(normalizedLocale), page);
  const title = options?.includeBrandSuffix
    ? AUTHENTICATED_TITLE_TEMPLATE.replace("%s", copy.title)
    : copy.title;

  return {
    title,
    description: copy.description,
    robots: PRIVATE_ROBOTS,
  };
}

export async function generateAuthenticatedPageMetadata(
  params: Promise<{ lang: string }>,
  page: AuthenticatedPageKey,
): Promise<Metadata> {
  const { lang } = await params;
  return getAuthenticatedPageMetadata(lang, page);
}

export function getAuthenticatedLayoutMetadata(locale: string): Metadata {
  const metadata = getAuthenticatedPageMetadata(locale, "layout");

  return {
    ...metadata,
    title: {
      default: typeof metadata.title === "string" ? metadata.title : "Hyperlocalise",
      template: AUTHENTICATED_TITLE_TEMPLATE,
    },
  };
}
