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
import { canonicalizeLocale } from "@/lib/i18n/locales";

function localeKey(locale: string): string {
  return locale.trim().toLowerCase();
}

/** True when two tags are the same project locale (canonical BCP-47, case-insensitive). */
export function figmaProjectLocalesMatch(a: string, b: string): boolean {
  const trimmedA = a.trim();
  const trimmedB = b.trim();
  if (!trimmedA || !trimmedB) {
    return false;
  }
  if (trimmedA === trimmedB) {
    return true;
  }
  if (localeKey(trimmedA) === localeKey(trimmedB)) {
    return true;
  }
  const canonicalA = canonicalizeLocale(trimmedA);
  const canonicalB = canonicalizeLocale(trimmedB);
  if (canonicalA && canonicalB && canonicalA === canonicalB) {
    return true;
  }
  return false;
}

export function isProjectSourceLocale(projectSourceLocale: string, locale: string): boolean {
  return figmaProjectLocalesMatch(projectSourceLocale, locale);
}
