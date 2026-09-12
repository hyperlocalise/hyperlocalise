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
  foldSpellcheckWord,
  normalizeSpellcheckWord,
  parseSpellcheckWordFile,
  SPELLCHECK_MAX_RESOLVED_WORDS,
  SPELLCHECK_MAX_WORD_LENGTH,
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
});
