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
export const SPELLCHECK_MAX_WORD_LENGTH = 64;
export const SPELLCHECK_MAX_LIBRARY_WORDS = 20_000;
export const SPELLCHECK_MAX_RESOLVED_WORDS = 5_000;

const WORD_CHAR_PATTERN = /^[\p{L}\p{M}\p{Nd}'’ʼʻ\-\u2010\u2011]+$/u;

export type NormalizedSpellcheckWord = {
  word: string;
  wordNormalized: string;
};

export function foldSpellcheckWord(word: string): string {
  return word.trim().toLocaleLowerCase("en");
}

export function normalizeSpellcheckWord(raw: string): NormalizedSpellcheckWord | null {
  const trimmed = raw.trim().normalize("NFC");
  if (!trimmed || Array.from(trimmed).length > SPELLCHECK_MAX_WORD_LENGTH) {
    return null;
  }

  if (/\s/.test(trimmed) || !WORD_CHAR_PATTERN.test(trimmed)) {
    return null;
  }

  return {
    word: trimmed,
    wordNormalized: foldSpellcheckWord(trimmed),
  };
}

export function parseSpellcheckWordFile(content: string): NormalizedSpellcheckWord[] {
  const seen = new Set<string>();
  const words: NormalizedSpellcheckWord[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parsed = normalizeSpellcheckWord(trimmed);
    if (!parsed || seen.has(parsed.wordNormalized)) {
      continue;
    }

    seen.add(parsed.wordNormalized);
    words.push(parsed);
  }

  return words;
}

export function serializeSpellcheckWordFile(words: readonly string[]): string {
  return `${words.join("\n")}\n`;
}

export function capResolvedSpellcheckWords(words: readonly string[]): string[] {
  if (words.length <= SPELLCHECK_MAX_RESOLVED_WORDS) {
    return [...words];
  }

  return [...words]
    .toSorted((left, right) => left.localeCompare(right, "en"))
    .slice(0, SPELLCHECK_MAX_RESOLVED_WORDS);
}
