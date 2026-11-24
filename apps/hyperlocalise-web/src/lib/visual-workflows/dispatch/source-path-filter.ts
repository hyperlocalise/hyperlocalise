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

/**
 * Which uploaded source files start a Source upload workflow. The editor's live preview and the
 * dispatcher both use this module, so a path the preview shows as matching is a path that runs.
 */
export type SourcePathMatchSyntax = "glob" | "regex";

export const MAX_SOURCE_PATH_PATTERNS = 20;
export const MAX_SOURCE_PATH_PATTERN_LENGTH = 200;
const MAX_MATCHED_PATH_LENGTH = 1024;

export type SourcePathPatternError = "empty" | "too_long" | "invalid" | "unsafe";

/**
 * A quantified group that itself repeats, such as `(a+)+` or `(\w*)*`, can take exponential time
 * on a path that almost matches. Paths are short, but a pattern runs on every upload, so refuse it.
 */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/;

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.?\/+/, "");
}

function escapeRegExp(character: string): string {
  return /[.+^${}()|[\]\\]/.test(character) ? `\\${character}` : character;
}

/**
 * Glob syntax: `*` matches within one folder, `**` across folders, `?` one character, `{a,b}`
 * either, and `[abc]` a character from the set. A pattern without a `/` matches the file name in
 * any folder, as `*.json` does in `.gitignore`.
 */
export function sourcePathGlobToRegExp(pattern: string): RegExp {
  const trimmed = normalizePath(pattern.trim());
  const anyFolder = !trimmed.includes("/");
  let source = "";
  let braceDepth = 0;

  for (let index = 0; index < trimmed.length; index++) {
    const character = trimmed[index]!;
    if (character === "*") {
      if (trimmed[index + 1] === "*") {
        const followedBySlash = trimmed[index + 2] === "/";
        source += followedBySlash ? "(?:.*/)?" : ".*";
        index += followedBySlash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
      source += "(?:";
      continue;
    }
    if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
      source += ")";
      continue;
    }
    if (character === "," && braceDepth > 0) {
      source += "|";
      continue;
    }
    if (character === "[") {
      const close = trimmed.indexOf("]", index + 1);
      if (close > index + 1) {
        const body = trimmed
          .slice(index + 1, close)
          .replace(/^!/, "^")
          .replaceAll("\\", "\\\\");
        source += `[${body}]`;
        index = close;
        continue;
      }
    }
    source += escapeRegExp(character);
  }
  if (braceDepth > 0) throw new Error("unbalanced_braces");

  return new RegExp(`^${anyFolder ? "(?:.*/)?" : ""}${source}$`, "i");
}

function compilePattern(pattern: string, syntax: SourcePathMatchSyntax): RegExp {
  return syntax === "glob" ? sourcePathGlobToRegExp(pattern) : new RegExp(pattern.trim(), "i");
}

/** Why a pattern cannot be used, or null when it can. */
export function sourcePathPatternError(
  pattern: string,
  syntax: SourcePathMatchSyntax,
): SourcePathPatternError | null {
  const trimmed = pattern.trim();
  if (!trimmed) return "empty";
  if (trimmed.length > MAX_SOURCE_PATH_PATTERN_LENGTH) return "too_long";
  if (syntax === "regex" && NESTED_QUANTIFIER.test(trimmed)) return "unsafe";
  try {
    compilePattern(trimmed, syntax);
    return null;
  } catch {
    return "invalid";
  }
}

/**
 * Whether an uploaded file's path passes the trigger's filter. No patterns lets every file through.
 * A pattern that cannot be used never matches, so a broken filter starts nothing rather than
 * everything; publish validation reports it.
 */
export function sourcePathMatches(
  path: string,
  filter: { syntax?: SourcePathMatchSyntax; patterns?: readonly string[] },
): boolean {
  const patterns = (filter.patterns ?? []).filter((pattern) => pattern.trim());
  if (patterns.length === 0) return true;
  const syntax = filter.syntax ?? "glob";
  const normalized = normalizePath(path).slice(0, MAX_MATCHED_PATH_LENGTH);

  return patterns.some((pattern) => {
    if (sourcePathPatternError(pattern, syntax)) return false;
    return compilePattern(pattern, syntax).test(normalized);
  });
}
