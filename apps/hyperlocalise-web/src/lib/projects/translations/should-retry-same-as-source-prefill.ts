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

const MIN_SOURCE_WORDS_FOR_SAME_AS_SOURCE_RETRY = 2;

function countSourceWords(sourceText: string): number {
  const trimmed = sourceText.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

/**
 * Multi-word source copies are not useful translations. Failed file jobs often
 * persist the source text into TM as an "approved" match, which then skips AI.
 * Single-word copies often stay untranslated on purpose (brands, codes).
 */
export function isSameAsSourceMemoryPrefill(input: {
  sourceText: string;
  targetText: string;
}): boolean {
  const sourceText = input.sourceText.trim();
  const targetText = input.targetText.trim();
  if (!sourceText || sourceText !== targetText) {
    return false;
  }

  return countSourceWords(sourceText) >= MIN_SOURCE_WORDS_FOR_SAME_AS_SOURCE_RETRY;
}

/**
 * Prefill skips these rows so translate-with-agent can try again.
 * Single-word copies often stay untranslated on purpose (brands, codes).
 */
export function shouldRetrySameAsSourcePrefill(input: {
  sourceText: string;
  targetText: string;
  status: string | null | undefined;
}): boolean {
  if (input.status !== "needs_review") {
    return false;
  }

  return isSameAsSourceMemoryPrefill(input);
}

/** Project translations win; TM fills untranslated keys when a reusable match exists. */
export function mergeTranslationPrefills(input: {
  tmPrefilled: Record<string, string>;
  projectPrefilled: Record<string, string>;
  retryKeys?: Iterable<string>;
}): Record<string, string> {
  const retryKeys = new Set(input.retryKeys ?? []);
  const merged = { ...input.tmPrefilled, ...input.projectPrefilled };
  if (retryKeys.size === 0) {
    return merged;
  }

  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!retryKeys.has(key)) {
      next[key] = value;
    }
  }
  return next;
}
