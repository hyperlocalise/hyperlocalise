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

import { z } from "zod";

/**
 * Per-file custom placeholder patterns: regular expressions whose matches are
 * treated as placeholders by validation and the editor. Matches go
 * `segmentvalidate.CompileCustomPlaceholderPatterns`, so patterns must use
 * syntax both JavaScript and Go (RE2) accept.
 */
export const MAX_PLACEHOLDER_PATTERNS = 20;
export const MAX_PLACEHOLDER_PATTERN_LENGTH = 200;

export type PlaceholderPatternError =
  | "empty"
  | "too_long"
  | "invalid"
  | "unsupported_syntax"
  | "matches_empty";

export interface CustomPlaceholderSpan {
  start: number;
  end: number;
  literal: string;
}

// RE2 has no lookaround or backreferences. Escaped backslashes are skipped so
// `\\1` (a literal backslash then "1") is allowed.
const UNSUPPORTED_SYNTAX_PATTERN = /(?:^|[^\\])(?:\\\\)*(?:\(\?<?[=!]|\\[1-9]|\\k<)/u;

function compileOne(pattern: string): RegExp | null {
  // Unicode mode first so \p{L} works; fall back for identity escapes like \: or \-
  // that Go accepts but Unicode-mode JavaScript rejects.
  for (const flags of ["gu", "g"]) {
    try {
      return new RegExp(pattern, flags);
    } catch {
      // Try the next flag set.
    }
  }
  return null;
}

export function validatePlaceholderPattern(pattern: string): PlaceholderPatternError | null {
  if (pattern.trim() === "") {
    return "empty";
  }
  if (pattern.length > MAX_PLACEHOLDER_PATTERN_LENGTH) {
    return "too_long";
  }
  if (UNSUPPORTED_SYNTAX_PATTERN.test(pattern)) {
    return "unsupported_syntax";
  }
  const compiled = compileOne(pattern);
  if (!compiled) {
    return "invalid";
  }
  compiled.lastIndex = 0;
  if (compiled.test("")) {
    return "matches_empty";
  }
  return null;
}

const PLACEHOLDER_PATTERN_ERROR_MESSAGES: Record<PlaceholderPatternError, string> = {
  empty: "Placeholder pattern is empty",
  too_long: `Placeholder pattern exceeds ${MAX_PLACEHOLDER_PATTERN_LENGTH} characters`,
  invalid: "Placeholder pattern is not a valid regular expression",
  unsupported_syntax: "Placeholder patterns cannot use lookaround or backreferences",
  matches_empty: "Placeholder pattern must not match empty text",
};

export const placeholderPatternsSchema = z
  .array(z.string())
  .max(MAX_PLACEHOLDER_PATTERNS)
  .transform((patterns) => Array.from(new Set(patterns.filter((pattern) => pattern.trim() !== ""))))
  .superRefine((patterns, ctx) => {
    patterns.forEach((pattern, index) => {
      const error = validatePlaceholderPattern(pattern);
      if (error) {
        ctx.addIssue({
          code: "custom",
          message: PLACEHOLDER_PATTERN_ERROR_MESSAGES[error],
          path: [index],
          params: { placeholderPatternError: error },
        });
      }
    });
  });

/** Keeps stored patterns usable: strings only, deduplicated, capped. */
export function normalizePlaceholderPatterns(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || value.trim() === "" || out.includes(value)) {
      continue;
    }
    out.push(value);
    if (out.length === MAX_PLACEHOLDER_PATTERNS) {
      break;
    }
  }
  return out;
}

const compiledCache = new Map<string, RegExp[]>();
const COMPILED_CACHE_LIMIT = 64;

/** Compiles usable patterns; invalid ones are skipped so one bad pattern cannot break callers. */
export function compilePlaceholderPatterns(
  patterns: readonly string[] | null | undefined,
): RegExp[] {
  if (!patterns || patterns.length === 0) {
    return [];
  }
  const key = patterns.join("\u0000");
  const cached = compiledCache.get(key);
  if (cached) {
    return cached;
  }
  const compiled: RegExp[] = [];
  for (const pattern of patterns.slice(0, MAX_PLACEHOLDER_PATTERNS)) {
    if (validatePlaceholderPattern(pattern) !== null) {
      continue;
    }
    const regex = compileOne(pattern);
    if (regex) {
      compiled.push(regex);
    }
  }
  if (compiledCache.size >= COMPILED_CACHE_LIMIT) {
    compiledCache.clear();
  }
  compiledCache.set(key, compiled);
  return compiled;
}

/**
 * Non-overlapping custom placeholder matches in text order. At each position the
 * earliest-starting, then longest, match wins (same rule as go-svc).
 */
export function extractCustomPlaceholderSpans(
  text: string,
  patterns: readonly string[] | null | undefined,
): CustomPlaceholderSpan[] {
  const compiled = compilePlaceholderPatterns(patterns);
  if (compiled.length === 0 || text === "") {
    return [];
  }
  const spans: CustomPlaceholderSpan[] = [];
  let position = 0;
  while (position < text.length) {
    let bestStart = -1;
    let bestEnd = -1;
    for (const regex of compiled) {
      regex.lastIndex = position;
      const match = regex.exec(text);
      if (!match || match[0] === "") {
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (bestStart < 0 || start < bestStart || (start === bestStart && end > bestEnd)) {
        bestStart = start;
        bestEnd = end;
      }
    }
    if (bestStart < 0) {
      break;
    }
    spans.push({ start: bestStart, end: bestEnd, literal: text.slice(bestStart, bestEnd) });
    position = bestEnd;
  }
  return spans;
}
