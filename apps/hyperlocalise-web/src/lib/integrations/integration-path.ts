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
import { normalizeAppLocale } from "@/lib/app-i18n/locales";

export function getIntegrationPath(lang: string, slug: string) {
  const locale = normalizeAppLocale(lang);
  if (!locale) {
    return null;
  }

  return `/${locale}/integrations/${slug}`;
}
