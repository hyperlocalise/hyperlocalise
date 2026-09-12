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
const ESCAPE_LITERALS = ["\\t", "\\n", "\\r", "\\0", "\\b"] as const;
const CONTROL_CHAR_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ["\t", "\\t"],
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\0", "\\0"],
];

function countRunes(value: string) {
  return [...value].length;
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

export function introducedEscapedChars(source: string, target: string) {
  if (!target || target === source) {
    return [];
  }

  const extras = new Set<string>();
  for (const token of ESCAPE_LITERALS) {
    if (target.includes(token) && !source.includes(token)) {
      extras.add(token);
    }
  }
  for (const [char, token] of CONTROL_CHAR_TOKENS) {
    if (target.includes(char) && !source.includes(char)) {
      extras.add(token);
    }
  }
  return [...extras].toSorted();
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
