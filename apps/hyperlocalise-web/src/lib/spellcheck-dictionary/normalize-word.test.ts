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
import { describe, expect, it } from "vite-plus/test";

import {
  capResolvedSpellcheckWords,
  chunkItems,
  foldSpellcheckWord,
  normalizeSpellcheckWord,
  parseSpellcheckWordFile,
  selectSpellcheckWordsToImport,
  SPELLCHECK_MAX_ACCEPTED_WORDS_BYTES,
  SPELLCHECK_MAX_RESOLVED_WORDS,
  SPELLCHECK_MAX_WORD_LENGTH,
  utf8ByteLength,
} from "./normalize-word";

describe("normalizeSpellcheckWord", () => {
  it("trims, NFC-normalizes, and folds case", () => {
    expect(normalizeSpellcheckWord("  Hyperlocalise ")).toEqual({
      word: "Hyperlocalise",
      wordNormalized: "hyperlocalise",
    });
    expect(foldSpellcheckWord("AUTHKIT")).toBe("authkit");
  });

  it("rejects phrases, empty tokens, and overlong words", () => {
    expect(normalizeSpellcheckWord("too many words")).toBeNull();
    expect(normalizeSpellcheckWord("")).toBeNull();
    expect(normalizeSpellcheckWord("a".repeat(SPELLCHECK_MAX_WORD_LENGTH + 1))).toBeNull();
  });
});

describe("parseSpellcheckWordFile", () => {
  it("skips comments, blanks, and duplicates", () => {
    expect(parseSpellcheckWordFile("# brands\nHyperlocalise\n\nhyperlocalise\nAuthKit\n")).toEqual([
      { word: "Hyperlocalise", wordNormalized: "hyperlocalise" },
      { word: "AuthKit", wordNormalized: "authkit" },
    ]);
  });
});

describe("chunkItems", () => {
  it("splits items into batches of the requested size", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("treats a non-positive size as one item per chunk", () => {
    expect(chunkItems(["a", "b"], 0)).toEqual([["a"], ["b"]]);
  });

  it("returns no chunks for an empty list", () => {
    expect(chunkItems([], 1_000)).toEqual([]);
  });
});

describe("selectSpellcheckWordsToImport", () => {
  it("skips existing normalized words before applying the remaining cap", () => {
    const parsedWords = [
      { word: "Hyperlocalise", wordNormalized: "hyperlocalise" },
      { word: "AuthKit", wordNormalized: "authkit" },
      { word: "Zernio", wordNormalized: "zernio" },
      { word: "Crowdin", wordNormalized: "crowdin" },
    ];

    expect(
      selectSpellcheckWordsToImport({
        parsedWords,
        existingNormalized: new Set(["hyperlocalise", "authkit"]),
        remainingCapacity: 1,
      }),
    ).toEqual([{ word: "Zernio", wordNormalized: "zernio" }]);
  });
});

describe("capResolvedSpellcheckWords", () => {
  it("sorts before truncating so the cap is stable", () => {
    const words = Array.from({ length: SPELLCHECK_MAX_RESOLVED_WORDS + 5 }, (_, index) => {
      return `w${String(SPELLCHECK_MAX_RESOLVED_WORDS + 4 - index).padStart(5, "0")}`;
    });

    const first = capResolvedSpellcheckWords(words);
    const second = capResolvedSpellcheckWords([...words].reverse());

    expect(first).toHaveLength(SPELLCHECK_MAX_RESOLVED_WORDS);
    expect(first).toEqual(second);
  });

  it("also caps by encoded UTF-8 JSON payload size", () => {
    const token = "测".repeat(SPELLCHECK_MAX_WORD_LENGTH);
    const words = Array.from({ length: 2_000 }, (_, index) => `${token}${index}`);
    const capped = capResolvedSpellcheckWords(words);

    expect(capped.length).toBeLessThan(words.length);
    expect(capped.length).toBeGreaterThan(0);
    expect(utf8ByteLength(JSON.stringify(capped))).toBeLessThanOrEqual(
      SPELLCHECK_MAX_ACCEPTED_WORDS_BYTES,
    );
  });
});
