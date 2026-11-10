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
import type { StringTranslationJobResult } from "@/lib/translation/domain";

/** Strings translated in one workflow step, so a long job resumes where it stopped. */
export const KEY_TRANSLATION_BATCH_SIZE = 10;

export type KeyTranslationTokenUsage = NonNullable<StringTranslationJobResult["tokenUsage"]>;

export type KeyTranslationBatchResult = {
  /** Translations saved, per language. */
  translated: Record<string, number>;
  /** Translations a model call or save did not produce, per language. */
  failed: Record<string, number>;
  tokenUsage: KeyTranslationTokenUsage | null;
  /** Set when the job stopped running under this run (cancelled, failed by hand or retried). */
  stopped?: boolean;
};

export type KeyTranslationJobOutcome = {
  kind: "key_translation_result";
  stringCount: number;
  translated: Record<string, number>;
  failed: Record<string, number>;
};

export function addTokenUsage(
  total: KeyTranslationTokenUsage | null,
  next: KeyTranslationTokenUsage | undefined,
): KeyTranslationTokenUsage | null {
  if (!next || next.totalTokens <= 0) return total;
  if (!total) return { ...next };
  return {
    ...total,
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    totalTokens: total.totalTokens + next.totalTokens,
    cacheReadTokens: (total.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0),
    cacheWriteTokens: (total.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0),
    reasoningTokens: (total.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0),
  };
}

export function mergeKeyTranslationBatchResults(
  results: KeyTranslationBatchResult[],
): KeyTranslationBatchResult {
  const merged: KeyTranslationBatchResult = { translated: {}, failed: {}, tokenUsage: null };
  for (const result of results) {
    for (const [locale, count] of Object.entries(result.translated)) {
      merged.translated[locale] = (merged.translated[locale] ?? 0) + count;
    }
    for (const [locale, count] of Object.entries(result.failed)) {
      merged.failed[locale] = (merged.failed[locale] ?? 0) + count;
    }
    merged.tokenUsage = addTokenUsage(merged.tokenUsage, result.tokenUsage ?? undefined);
    if (result.stopped) merged.stopped = true;
  }
  return merged;
}
