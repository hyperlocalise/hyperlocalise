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
  COMMONLY_USED_UNICODE_CHARACTERS,
  filterUnicodeCharacters,
  formatUnicodeCodePoint,
} from "./content-editor-unicode-characters";

describe("content-editor-unicode-characters", () => {
  it("includes Crowdin commonly-used translator characters", () => {
    const chars = new Set(COMMONLY_USED_UNICODE_CHARACTERS.map((character) => character.char));

    expect(chars.has("\u00A0")).toBe(true);
    expect(chars.has("–")).toBe(true);
    expect(chars.has("—")).toBe(true);
    expect(chars.has("\u201C")).toBe(true);
    expect(chars.has("€")).toBe(true);
    expect(chars.has("…")).toBe(true);
  });

  it("omits Latin letters that belong on a keyboard", () => {
    expect(COMMONLY_USED_UNICODE_CHARACTERS.some((character) => character.char === "é")).toBe(
      false,
    );
    expect(COMMONLY_USED_UNICODE_CHARACTERS.some((character) => character.char === "ñ")).toBe(
      false,
    );
  });

  it("formats code points as U+XXXX", () => {
    expect(formatUnicodeCodePoint(0x00a0)).toBe("U+00A0");
    expect(formatUnicodeCodePoint(0x20ac)).toBe("U+20AC");
  });

  it("filters by name, short label, glyph, and code point", () => {
    expect(filterUnicodeCharacters(COMMONLY_USED_UNICODE_CHARACTERS, "nbsp")[0]?.shortLabel).toBe(
      "NBSP",
    );
    expect(filterUnicodeCharacters(COMMONLY_USED_UNICODE_CHARACTERS, "€")[0]?.char).toBe("€");
    expect(filterUnicodeCharacters(COMMONLY_USED_UNICODE_CHARACTERS, "u+2014")[0]?.char).toBe("—");
    expect(filterUnicodeCharacters(COMMONLY_USED_UNICODE_CHARACTERS, "guillemet").length).toBe(2);
    expect(filterUnicodeCharacters(COMMONLY_USED_UNICODE_CHARACTERS, "zzzzzz")).toEqual([]);
  });
});
