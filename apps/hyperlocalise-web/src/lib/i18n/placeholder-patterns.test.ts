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
  extractCustomPlaceholderSpans,
  MAX_PLACEHOLDER_PATTERNS,
  normalizePlaceholderPatterns,
  placeholderPatternsSchema,
  validatePlaceholderPattern,
} from "./placeholder-patterns";

describe("validatePlaceholderPattern", () => {
  it.each([
    ["\\[\\[\\w+\\]\\]", null],
    ["\\p{Lu}{2,}_\\d+", null],
    ["\\:\\w+", null],
    ["", "empty"],
    ["   ", "empty"],
    ["x".repeat(201), "too_long"],
    ["[unclosed", "invalid"],
    ["(?=x)y", "unsupported_syntax"],
    ["(?<!x)y", "unsupported_syntax"],
    ["(a)\\1", "unsupported_syntax"],
    ["(?<n>a)\\k<n>", "unsupported_syntax"],
    ["\\\\1", null],
    ["a*", "matches_empty"],
  ])("%s -> %s", (pattern, expected) => {
    expect(validatePlaceholderPattern(pattern)).toBe(expected);
  });
});

describe("placeholderPatternsSchema", () => {
  it("drops blank lines and duplicates", () => {
    expect(placeholderPatternsSchema.parse([":\\w+", "", ":\\w+", "%\\w+%"])).toEqual([
      ":\\w+",
      "%\\w+%",
    ]);
  });

  it("reports the index of an invalid pattern", () => {
    const result = placeholderPatternsSchema.safeParse([":\\w+", "[bad"]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([1]);
  });

  it("caps the number of patterns", () => {
    const patterns = Array.from({ length: MAX_PLACEHOLDER_PATTERNS + 1 }, (_, i) => `x${i}`);
    expect(placeholderPatternsSchema.safeParse(patterns).success).toBe(false);
  });
});

describe("normalizePlaceholderPatterns", () => {
  it("keeps strings only", () => {
    expect(normalizePlaceholderPatterns(null)).toEqual([]);
    expect(normalizePlaceholderPatterns([":\\w+", 3, "", ":\\w+"])).toEqual([":\\w+"]);
  });
});

describe("extractCustomPlaceholderSpans", () => {
  it("prefers the earliest, then longest, match without overlaps", () => {
    const spans = extractCustomPlaceholderSpans("Hi [[name]], see :link and [x]", [
      "\\[\\w+\\]",
      "\\[\\[\\w+\\]\\]",
      ":\\w+",
    ]);
    expect(spans.map((span) => span.literal)).toEqual(["[[name]]", ":link", "[x]"]);
    expect(spans[0]).toMatchObject({ start: 3, end: 11 });
  });

  it("skips invalid patterns", () => {
    expect(extractCustomPlaceholderSpans("a :b", ["[bad", ":\\w+"])).toEqual([
      { start: 2, end: 4, literal: ":b" },
    ]);
  });

  it("returns nothing without patterns", () => {
    expect(extractCustomPlaceholderSpans("a :b", [])).toEqual([]);
  });
});
