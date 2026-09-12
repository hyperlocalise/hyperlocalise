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

/** BCP 47 language tag for schema.org `inLanguage` on localized pages. */
export function jsonLdInLanguage(locale: AppLocale): string {
  return locale;
}
