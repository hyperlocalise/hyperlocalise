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

import { isSameAsSourceMemoryPrefill } from "@/lib/projects/translations/should-retry-same-as-source-prefill";

/** Drop multi-word source copies from job output maps (Apply must not treat them as translations). */
export function omitMultiWordSameAsSourceTranslations(
  sourceEntries: Record<string, string>,
  translations: Record<string, string>,
): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(translations)) {
    if (
      isSameAsSourceMemoryPrefill({
        sourceText: sourceEntries[key] ?? "",
        targetText: value,
      })
    ) {
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}
