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

/** Canonical BCP 47 tag for `html lang`, hreflang, and JSON-LD `inLanguage`. */
export function appLocaleToBcp47Tag(locale: AppLocale): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {
    const [language, region] = locale.split("-");
    if (!language) {
      return locale;
    }
    return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
  }
}
