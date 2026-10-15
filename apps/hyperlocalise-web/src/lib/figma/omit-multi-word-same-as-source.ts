/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
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
