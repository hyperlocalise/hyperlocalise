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
import { validateGlossaryTermsInTranslation } from "@/lib/glossary/validate-glossary-terms-in-translation";

import type {
  TranslationQaCheck,
  TranslationQaGlossaryTerm,
  TranslationQaSegmentInput,
} from "./types";

const PLACEHOLDER_PATTERN = /\{[^{}\s]+\}|%\d*\$?[sd]|%\w+/gu;

function countRunes(value: string) {
  let count = 0;
  for (const _character of value) {
    count += 1;
  }
  return count;
}

function collectPlaceholders(value: string) {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[0]).toSorted();
}

function describeIntroducedEscapedChars(tokens: readonly string[]) {
  if (tokens.length === 0) {
    return "Target introduces escaped characters that are not in the source.";
  }
  if (tokens.length === 1) {
    return `Target introduces escaped characters (${tokens[0]}) that are not in the source.`;
  }
  return `Target introduces escaped characters (${tokens.join(", ")}) that are not in the source.`;
}

function isHexByte(value: string) {
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70);
}

function isControlCodePoint(codePoint: number) {
  return (codePoint >= 0 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function controlCharToken(codePoint: number) {
  switch (codePoint) {
    case 0x09:
      return "\\t";
    case 0x0a:
      return "\\n";
    case 0x0d:
      return "\\r";
    case 0x0b:
      return "\\v";
    case 0x0c:
      return "\\f";
    default:
      if (isControlCodePoint(codePoint)) {
        return `\\u${codePoint.toString(16).padStart(4, "0")}`;
      }
      return "";
  }
}

function extractControlCharTokens(value: string) {
  const tokens: string[] = [];
  for (const character of value) {
    const token = controlCharToken(character.codePointAt(0) ?? -1);
    if (token) {
      tokens.push(token);
    }
  }
  return tokens;
}

function readSpecialCharLiteral(value: string, start: number) {
  if (value[start] !== "\\") {
    return null;
  }

  const rest = value.slice(start);
  if (rest.startsWith("\\r\\n")) {
    return { token: "\\r\\n", width: 4 };
  }
  if (rest.startsWith("\\r")) {
    return { token: "\\r", width: 2 };
  }
  if (rest.startsWith("\\n")) {
    return { token: "\\n", width: 2 };
  }
  if (rest.startsWith("\\t")) {
    return { token: "\\t", width: 2 };
  }

  if (rest.startsWith("\\u") || rest.startsWith("\\U")) {
    const hexLen = rest[1] === "U" ? 8 : 4;
    if (start + 2 + hexLen > value.length) {
      return null;
    }
    const hex = value.slice(start + 2, start + 2 + hexLen);
    for (const digit of hex) {
      if (!isHexByte(digit)) {
        return null;
      }
    }
    return { token: value.slice(start, start + 2 + hexLen), width: 2 + hexLen };
  }

  if (rest.startsWith("\\x")) {
    let end = start + 2;
    while (end < value.length && end < start + 4 && isHexByte(value[end] ?? "")) {
      end += 1;
    }
    if (end === start + 2) {
      return null;
    }
    return { token: value.slice(start, end), width: end - start };
  }

  return null;
}

function extractSpecialCharLiterals(value: string) {
  if (!value.includes("\\")) {
    return [];
  }

  const tokens: string[] = [];
  for (let index = 0; index < value.length;) {
    if (value[index] !== "\\") {
      index += 1;
      continue;
    }
    const literal = readSpecialCharLiteral(value, index);
    if (literal) {
      tokens.push(literal.token);
      index += literal.width;
      continue;
    }
    index += 1;
  }
  return tokens;
}

function extraTokens(got: readonly string[], expected: readonly string[]) {
  const expectedCounts = new Map<string, number>();
  for (const token of expected) {
    expectedCounts.set(token, (expectedCounts.get(token) ?? 0) + 1);
  }

  const extras: string[] = [];
  const seen = new Set<string>();
  for (const token of got) {
    const remaining = expectedCounts.get(token) ?? 0;
    if (remaining > 0) {
      expectedCounts.set(token, remaining - 1);
      continue;
    }
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    extras.push(token);
  }
  return extras;
}

/**
 * Escape sequences and control characters that appear in target but not source.
 * Matches go-svc `IntroducedEscapedChars`: literal `\t` `\n` `\r` `\r\n` `\u`
 * `\U` `\x`, plus decoded Cc controls including `\v` `\f` NUL, backspace, and C1.
 */
export function introducedEscapedChars(source: string, target: string) {
  if (!target || target === source) {
    return [];
  }

  const hasLiteralEscapes = target.includes("\\");
  const controlTokens = extractControlCharTokens(target);
  if (!hasLiteralEscapes && controlTokens.length === 0) {
    return [];
  }

  const extras: string[] = [];
  if (hasLiteralEscapes) {
    extras.push(
      ...extraTokens(extractSpecialCharLiterals(target), extractSpecialCharLiterals(source)),
    );
  }
  if (controlTokens.length > 0) {
    extras.push(...extraTokens(controlTokens, extractControlCharTokens(source)));
  }
  return [...new Set(extras)].toSorted();
}

function glossaryTermsForLocale(
  terms: readonly TranslationQaGlossaryTerm[] | undefined,
  targetLocale: string,
) {
  if (!terms || terms.length === 0) {
    return [];
  }
  return terms.filter((term) => term.targetLocale === targetLocale);
}

export function validateTranslationSegment(input: TranslationQaSegmentInput): TranslationQaCheck[] {
  const checks: TranslationQaCheck[] = [];
  const source = input.sourceText;
  const target = input.targetText;
  const sourceTrimmed = source.trim();
  const targetTrimmed = target.trim();

  if (targetTrimmed === "") {
    checks.push({
      checkType: "not_localized",
      severity: "error",
      category: "qa",
      message:
        sourceTrimmed === ""
          ? "Target value is empty while source is also empty."
          : "Target value is empty.",
      relatedTokens: [],
    });
  }

  if (target !== "" && targetTrimmed === "") {
    checks.push({
      checkType: "whitespace_only",
      severity: "warning",
      category: "qa",
      message: "Target value contains only whitespace.",
      relatedTokens: [],
    });
  }

  if (targetTrimmed !== "" && sourceTrimmed !== "" && sourceTrimmed === targetTrimmed) {
    checks.push({
      checkType: "same_as_source",
      severity: "warning",
      category: "qa",
      message: "Target value matches source.",
      relatedTokens: [],
    });
  }

  const escapedTokens = introducedEscapedChars(source, target);
  if (escapedTokens.length > 0) {
    checks.push({
      checkType: "escaped_char_mismatch",
      severity: "warning",
      category: "qa",
      message: describeIntroducedEscapedChars(escapedTokens),
      relatedTokens: escapedTokens,
    });
  }

  if (input.maxLength != null && input.maxLength > 0 && countRunes(target) > input.maxLength) {
    checks.push({
      checkType: "length",
      severity: "error",
      category: "length",
      message: `Translation exceeds ${input.maxLength} characters.`,
      relatedTokens: [],
    });
  }

  if (targetTrimmed !== "") {
    const sourcePlaceholders = new Set(collectPlaceholders(source));
    const targetPlaceholders = new Set(collectPlaceholders(target));
    const absent = [...sourcePlaceholders].filter((token) => !targetPlaceholders.has(token));
    const extra = [...targetPlaceholders].filter((token) => !sourcePlaceholders.has(token));
    if (absent.length > 0 || extra.length > 0) {
      checks.push({
        checkType: "placeholder_mismatch",
        severity: "error",
        category: "placeholder",
        message:
          absent.length > 0
            ? `Target is missing placeholders (${absent.join(", ")}).`
            : `Target introduces placeholders (${extra.join(", ")}) that are not in the source.`,
        relatedTokens: [...new Set([...absent, ...extra])],
      });
    }
  }

  const localeTerms = glossaryTermsForLocale(input.glossaryTerms, input.targetLocale);
  if (localeTerms.length > 0 && targetTrimmed !== "") {
    const failures = validateGlossaryTermsInTranslation({
      sourceText: source,
      translatedText: target,
      terms: localeTerms.map((term) => ({
        sourceTerm: term.sourceTerm,
        targetTerm: term.targetTerm,
        targetLocale: term.targetLocale,
        forbidden: term.forbidden,
        caseSensitive: term.caseSensitive,
      })),
    });
    for (const failure of failures) {
      checks.push({
        checkType: "glossary_violation",
        severity: failure.forbidden ? "error" : "warning",
        category: "glossary",
        message:
          failure.reason === "contains_forbidden_term"
            ? `Forbidden term "${failure.targetTerm}" appears in the target.`
            : `Glossary term "${failure.sourceTerm}" requires "${failure.targetTerm}".`,
        relatedTokens: [failure.targetTerm],
      });
    }
  }

  return checks;
}
