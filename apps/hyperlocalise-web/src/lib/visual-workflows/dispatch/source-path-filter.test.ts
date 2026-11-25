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

import { sourcePathMatches, sourcePathPatternError } from "./source-path-filter";

const glob = (patterns: string[]) => ({ syntax: "glob" as const, patterns });
const regex = (patterns: string[]) => ({ syntax: "regex" as const, patterns });

describe("sourcePathMatches", () => {
  it("lets every file through without patterns", () => {
    expect(sourcePathMatches("anything/at/all.txt", {})).toBe(true);
    expect(sourcePathMatches("a.json", glob(["", "  "]))).toBe(true);
  });

  it.each([
    ["locales/en/**/*.json", "locales/en/app.json", true],
    ["locales/en/**/*.json", "locales/en/web/app.json", true],
    ["locales/en/**/*.json", "locales/fr/app.json", false],
    ["locales/en/*.json", "locales/en/web/app.json", false],
    ["*.json", "deep/folder/app.json", true],
    ["*.{md,mdx}", "docs/intro.mdx", true],
    ["*.{md,mdx}", "docs/intro.txt", false],
    ["docs/**", "docs/a/b/c.md", true],
    ["app.?son", "app.json", true],
    ["[ab].json", "b.json", true],
    ["[!ab].json", "b.json", false],
    ["Locales/EN/*.json", "locales/en/app.json", true],
    ["locales/en/*.json", "./locales/en/app.json", true],
    ["locales/en/*.json", "locales\\en\\app.json", true],
  ])("glob %s on %s is %s", (pattern, path, expected) => {
    expect(sourcePathMatches(path, glob([pattern]))).toBe(expected);
  });

  it("treats glob special characters other than wildcards as text", () => {
    expect(sourcePathMatches("v1.0+beta/app.json", glob(["v1.0+beta/*.json"]))).toBe(true);
    expect(sourcePathMatches("v1x0+beta/app.json", glob(["v1.0+beta/*.json"]))).toBe(false);
  });

  it("matches regular expressions against the path, ignoring case", () => {
    expect(sourcePathMatches("locales/en/app.json", regex(["^locales/en/.*\\.json$"]))).toBe(true);
    expect(sourcePathMatches("Docs/Intro.MDX", regex(["\\.(md|mdx)$"]))).toBe(true);
    expect(sourcePathMatches("locales/fr/app.json", regex(["^locales/en/"]))).toBe(false);
  });

  it("matches when any pattern does", () => {
    expect(sourcePathMatches("docs/a.md", glob(["*.json", "docs/**"]))).toBe(true);
  });

  it("never matches through a pattern that cannot be used", () => {
    expect(sourcePathMatches("a.json", regex(["("]))).toBe(false);
    expect(sourcePathMatches("aaaa", regex(["(a+)+$"]))).toBe(false);
    expect(sourcePathMatches("a.json", glob(["{a,b"]))).toBe(false);
  });
});

describe("sourcePathPatternError", () => {
  it("says why a pattern cannot be used", () => {
    expect(sourcePathPatternError("  ", "glob")).toBe("empty");
    expect(sourcePathPatternError("a".repeat(201), "glob")).toBe("too_long");
    expect(sourcePathPatternError("([a-z]", "regex")).toBe("invalid");
    expect(sourcePathPatternError("{a,b", "glob")).toBe("invalid");
    expect(sourcePathPatternError("(\\w*)*x", "regex")).toBe("unsafe");
    expect(sourcePathPatternError("(a|b){2,}", "regex")).toBeNull();
    expect(sourcePathPatternError("**/*.json", "glob")).toBeNull();
  });
});
