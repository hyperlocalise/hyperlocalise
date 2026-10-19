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

import { resolveIntercomLocaleKey } from "@/lib/intercom/intercom-locale";

export {
  areIntercomSourceLocalesCompatible as areSanitySourceLocalesCompatible,
  buildIntercomArticleLocaleMapping as buildSanityDocumentLocaleMapping,
  mapProjectLocalesToIntercom as mapProjectLocalesToSanity,
  normalizeIntercomLocaleTag as normalizeSanityLocaleTag,
  resolveIntercomLocaleKey as resolveSanityLocaleKey,
  unionIntercomLocales as unionSanityLocales,
} from "@/lib/intercom/intercom-locale";

/**
 * Choose the Sanity source tag from a discovered catalog.
 * Prefers the project source mapping, then a still-valid current tag.
 * Returns "" when nothing maps so save can fail instead of guessing.
 */
export function pickSanitySourceLocale(input: {
  catalog: readonly string[];
  currentSourceLocale?: string | null;
  projectSourceLocale?: string | null;
}): string {
  const catalog = input.catalog.filter((locale) => locale.trim().length > 0);
  const projectSource = input.projectSourceLocale?.trim() || "";
  if (projectSource) {
    const mapped = resolveIntercomLocaleKey(projectSource, catalog);
    if (mapped) {
      return mapped;
    }
  }

  const current = input.currentSourceLocale?.trim() || "";
  if (current) {
    const resolvedCurrent = resolveIntercomLocaleKey(current, catalog);
    if (resolvedCurrent) {
      return resolvedCurrent;
    }
  }

  return "";
}
