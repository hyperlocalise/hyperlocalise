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

import { resolvedSpellcheckWordsVersion, unionResolvedSpellcheckWords } from "./resolve-words";

describe("unionResolvedSpellcheckWords", () => {
  it("keeps casing from the lower-priority library", () => {
    expect(
      unionResolvedSpellcheckWords([
        {
          dictionaryId: "b",
          wordsVersion: 1,
          priority: 10,
          createdAtMs: 20,
          word: "authkit",
          wordNormalized: "authkit",
        },
        {
          dictionaryId: "a",
          wordsVersion: 2,
          priority: 0,
          createdAtMs: 10,
          word: "AuthKit",
          wordNormalized: "authkit",
        },
        {
          dictionaryId: "a",
          wordsVersion: 2,
          priority: 0,
          createdAtMs: 10,
          word: "Hyperlocalise",
          wordNormalized: "hyperlocalise",
        },
      ]),
    ).toEqual(["AuthKit", "Hyperlocalise"]);
  });

  it("breaks equal-priority ties by earlier attachment then dictionary id", () => {
    expect(
      unionResolvedSpellcheckWords([
        {
          dictionaryId: "b",
          wordsVersion: 1,
          priority: 0,
          createdAtMs: 20,
          word: "authkit",
          wordNormalized: "authkit",
        },
        {
          dictionaryId: "a",
          wordsVersion: 1,
          priority: 0,
          createdAtMs: 10,
          word: "AuthKit",
          wordNormalized: "authkit",
        },
      ]),
    ).toEqual(["AuthKit"]);
  });
});

describe("resolvedSpellcheckWordsVersion", () => {
  it("is stable regardless of attachment order", () => {
    expect(
      resolvedSpellcheckWordsVersion(
        [
          { dictionaryId: "b", wordsVersion: 3 },
          { dictionaryId: "a", wordsVersion: 1 },
        ],
        "en-US",
      ),
    ).toBe(
      resolvedSpellcheckWordsVersion(
        [
          { dictionaryId: "a", wordsVersion: 1 },
          { dictionaryId: "b", wordsVersion: 3 },
        ],
        "en-US",
      ),
    );
  });
});
