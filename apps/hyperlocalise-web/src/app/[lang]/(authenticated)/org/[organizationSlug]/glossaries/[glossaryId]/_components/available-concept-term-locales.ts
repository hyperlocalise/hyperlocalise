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
import { COMMON_LOCALES } from "@/lib/i18n/locales";

/**
 * Locales offered when adding a term to a concept.
 *
 * The concept API allows multiple terms in one locale (synonyms and variants),
 * including the source locale. Already-used locales therefore stay selectable.
 */
export function availableConceptTermLocales(
  commonLocales: readonly string[] = COMMON_LOCALES,
): readonly string[] {
  return commonLocales;
}
