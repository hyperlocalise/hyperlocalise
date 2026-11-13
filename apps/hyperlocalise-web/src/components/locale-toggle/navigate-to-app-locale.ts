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
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";

/** Full reload so server-rendered catalogs, metadata, and the locale cookie all switch together. */
export function navigateToAppLocale(nextLocale: AppLocale) {
  const { pathname, search, hash } = window.location;
  window.location.assign(rewriteAppLocalePath(`${pathname}${search}${hash}`, nextLocale));
}
