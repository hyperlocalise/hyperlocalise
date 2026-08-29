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
import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isPoundElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  parse,
  type Location,
  type MessageFormatElement,
  type PluralElement,
  type SelectElement,
} from "@formatjs/icu-messageformat-parser";

import { extractInternalMarkupSpans } from "./content-editor-internal-markup";

export type ContentEditorMessageTokenKind =
  | "argument"
  | "icu"
  | "number"
  | "date"
  | "time"
  | "pound"
  | "tag"
  | "markup";

export interface ContentEditorMessageToken {
  id: string;
  kind: ContentEditorMessageTokenKind;
  name: string;
  literal: string;
  start: number;
  end: number;
  options?: string[];
  type?: "plural" | "select" | "selectordinal";
  /** Short chip label for internal markup sentinels (e.g. MD#0). */
  displayLabel?: string;
}

export interface ContentEditorIcuBlockSummary {
  id: string;
  arg: string;
  type: "plural" | "select" | "selectordinal";
  options: string[];
}

export interface ContentEditorMessageAnalysis {
  message: string;
  tokens: ContentEditorMessageToken[];
  placeholders: ContentEditorMessageToken[];
  icuBlocks: ContentEditorIcuBlockSummary[];
  parseError?: {
    message: string;
    start: number;
    end: number;
  };
}

export interface ContentEditorMessageParityIssue {
  kind: "missing-token" | "extra-token" | "icu-mismatch" | "token-order" | "parse-error";
  tokens?: string[];
  parseErrorMessage?: string;
  parseTarget?: "source" | "target";
}

function locationRange(location: Location | undefined, fallbackEnd: number) {
  return {
    start: location?.start.offset ?? 0,
    end: location?.end.offset ?? fallbackEnd,
  };
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((first, second) => first.localeCompare(second));
}

function elementType(element: PluralElement | SelectElement): ContentEditorMessageToken["type"] {
  if (isPluralElement(element)) {
    return element.pluralType === "ordinal" ? "selectordinal" : "plural";
  }

  return "select";
}

function pushToken(
  tokens: ContentEditorMessageToken[],
  message: string,
  element: MessageFormatElement,
  index: number,
) {
  if (isArgumentElement(element)) {
    const range = locationRange(element.location, message.length);
    tokens.push({
      id: `argument-${element.value}-${range.start}-${index}`,
      kind: "argument",
      name: element.value,
      literal: message.slice(range.start, range.end),
      ...range,
    });
    return;
  }

  if (isNumberElement(element) || isDateElement(element) || isTimeElement(element)) {
    const range = locationRange(element.location, message.length);
    const kind = isNumberElement(element) ? "number" : isDateElement(element) ? "date" : "time";
    tokens.push({
      id: `${kind}-${element.value}-${range.start}-${index}`,
      kind,
      name: element.value,
      literal: message.slice(range.start, range.end),
      ...range,
    });
    return;
  }

  if (isPluralElement(element) || isSelectElement(element)) {
    const range = locationRange(element.location, message.length);
    const type = elementType(element);
    tokens.push({
      id: `${type}-${element.value}-${range.start}-${index}`,
      kind: "icu",
      name: element.value,
      literal: message.slice(range.start, range.end),
      options: uniqueSorted(Object.keys(element.options)),
      type,
      ...range,
    });
    return;
  }

  if (isPoundElement(element)) {
    const range = locationRange(element.location, message.length);
    tokens.push({
      id: `pound-${range.start}-${index}`,
      kind: "pound",
      name: "#",
      literal: message.slice(range.start, range.end) || "#",
      ...range,
    });
    return;
  }

  if (isTagElement(element)) {
    const range = locationRange(element.location, message.length);
    tokens.push({
      id: `tag-${element.value}-${range.start}-${index}`,
      kind: "tag",
      name: element.value,
      literal: message.slice(range.start, range.end),
      ...range,
    });
  }
}

function walkElements(
  elements: MessageFormatElement[],
  message: string,
  tokens: ContentEditorMessageToken[],
  startIndex = 0,
) {
  elements.forEach((element, index) => {
    const tokenIndex = startIndex + index;
    pushToken(tokens, message, element, tokenIndex);

    if (isPluralElement(element) || isSelectElement(element)) {
      Object.values(element.options).forEach((option) => {
        walkElements(option.value, message, tokens, tokens.length);
      });
    }

    if (isTagElement(element)) {
      walkElements(element.children, message, tokens, tokens.length);
    }
  });
}

function markupTokensFromMessage(message: string): ContentEditorMessageToken[] {
  return extractInternalMarkupSpans(message).map((span, index) => ({
    id: `markup-${span.family}-${span.index}-${span.start}-${index}`,
    kind: "markup" as const,
    name: span.label,
    literal: span.literal,
    start: span.start,
    end: span.end,
    displayLabel: span.label,
  }));
}

function mergeMessageTokens(
  markupTokens: ContentEditorMessageToken[],
  icuTokens: ContentEditorMessageToken[],
) {
  return [...markupTokens, ...icuTokens].toSorted((first, second) => first.start - second.start);
}

function placeholderTokens(tokens: ContentEditorMessageToken[]) {
  return tokens.filter((token) =>
    ["argument", "number", "date", "time", "tag", "markup"].includes(token.kind),
  );
}

function icuBlockSummaries(tokens: ContentEditorMessageToken[]): ContentEditorIcuBlockSummary[] {
  return tokens
    .filter((token) => token.kind === "icu" && token.type)
    .map((token) => ({
      id: token.id,
      arg: token.name,
      type: token.type!,
      options: token.options ?? [],
    }));
}

export function analyzeCatMessageFormat(message: string): ContentEditorMessageAnalysis {
  const markupTokens = markupTokensFromMessage(message);

  try {
    const ast = parse(message, {
      captureLocation: true,
      ignoreTag: false,
      requiresOtherClause: true,
    });
    const icuTokens: ContentEditorMessageToken[] = [];
    walkElements(ast, message, icuTokens);
    const tokens = mergeMessageTokens(markupTokens, icuTokens);

    return {
      message,
      tokens,
      placeholders: placeholderTokens(tokens),
      icuBlocks: icuBlockSummaries(tokens),
    };
  } catch (error) {
    const parserError = error as {
      message?: string;
      location?: Location;
    };
    const range = locationRange(parserError.location, Math.max(message.length, 1));

    return {
      message,
      tokens: markupTokens,
      placeholders: placeholderTokens(markupTokens),
      icuBlocks: [],
      parseError: {
        message: parserError.message ?? "",
        start: range.start,
        end: Math.max(range.end, range.start + 1),
      },
    };
  }
}

/** Stable signature for placeholder parity and required-token UI lookup. */
export function contentEditorMessageTokenSignature(token: ContentEditorMessageToken) {
  if (token.kind === "icu") {
    return `${token.kind}:${token.name}:${token.type}`;
  }

  if (token.kind === "markup") {
    // Exact sentinel bytes must round-trip; label alone is not unique across hashes.
    return `${token.kind}:${token.literal}`;
  }

  return `${token.kind}:${token.name}`;
}

function tokenDisplayName(token: ContentEditorMessageToken) {
  if (token.kind === "icu") {
    return `{${token.name}, ${token.type}}`;
  }

  if (token.kind === "tag") {
    return `<${token.name}>`;
  }

  if (token.kind === "markup") {
    return token.displayLabel ?? token.name;
  }

  return `{${token.name}}`;
}

function signatureCounts(tokens: ContentEditorMessageToken[]) {
  const counts = new Map<string, { count: number; sample: ContentEditorMessageToken }>();
  for (const token of tokens) {
    const signature = contentEditorMessageTokenSignature(token);
    const entry = counts.get(signature);
    if (entry) {
      entry.count += 1;
      continue;
    }
    counts.set(signature, { count: 1, sample: token });
  }
  return counts;
}

/** Tokens present more often on the left than the right (multiset difference). */
function findMissingTokens(
  leftTokens: ContentEditorMessageToken[],
  rightTokens: ContentEditorMessageToken[],
) {
  const rightCounts = new Map<string, number>();
  for (const token of rightTokens) {
    const signature = contentEditorMessageTokenSignature(token);
    rightCounts.set(signature, (rightCounts.get(signature) ?? 0) + 1);
  }

  const missing: ContentEditorMessageToken[] = [];
  for (const [signature, { count, sample }] of signatureCounts(leftTokens)) {
    const deficit = count - (rightCounts.get(signature) ?? 0);
    for (let index = 0; index < deficit; index += 1) {
      missing.push(sample);
    }
  }
  return missing;
}

function markupTokensInOrder(tokens: ContentEditorMessageToken[]) {
  return tokens.filter((token) => token.kind === "markup");
}

/** True when both sides have the same markup multiset but a different order/nesting. */
function markupOrderMismatch(
  source: ContentEditorMessageAnalysis,
  target: ContentEditorMessageAnalysis,
) {
  const sourceMarkup = markupTokensInOrder(source.tokens);
  const targetMarkup = markupTokensInOrder(target.tokens);
  if (sourceMarkup.length < 2 || sourceMarkup.length !== targetMarkup.length) {
    return false;
  }
  if (findMissingTokens(sourceMarkup, targetMarkup).length > 0) {
    return false;
  }
  if (findMissingTokens(targetMarkup, sourceMarkup).length > 0) {
    return false;
  }
  return sourceMarkup.some(
    (token, index) =>
      contentEditorMessageTokenSignature(token) !==
      contentEditorMessageTokenSignature(targetMarkup[index]!),
  );
}

function analysisHasMarkup(analysis: ContentEditorMessageAnalysis) {
  return analysis.tokens.some((token) => token.kind === "markup");
}

export function compareCatMessageFormats(
  source: ContentEditorMessageAnalysis,
  target: ContentEditorMessageAnalysis,
): ContentEditorMessageParityIssue[] {
  const issues: ContentEditorMessageParityIssue[] = [];
  const hasMarkup = analysisHasMarkup(source) || analysisHasMarkup(target);

  if (source.parseError) {
    issues.push({
      kind: "parse-error",
      parseTarget: "source",
      parseErrorMessage: source.parseError.message || undefined,
    });
  }
  if (target.parseError) {
    issues.push({
      kind: "parse-error",
      parseTarget: "target",
      parseErrorMessage: target.parseError.message || undefined,
    });
  }

  // Pure ICU parse failures without markup have nothing else useful to compare.
  if ((source.parseError || target.parseError) && !hasMarkup) {
    return issues;
  }

  const missingPlaceholders = findMissingTokens(source.placeholders, target.placeholders);
  if (missingPlaceholders.length > 0) {
    const labels = uniqueSorted(missingPlaceholders.map(tokenDisplayName));
    issues.push({
      kind: "missing-token",
      tokens: labels,
    });
  }

  const extraPlaceholders = findMissingTokens(target.placeholders, source.placeholders);
  if (extraPlaceholders.length > 0) {
    const labels = uniqueSorted(extraPlaceholders.map(tokenDisplayName));
    issues.push({
      kind: "extra-token",
      tokens: labels,
    });
  }

  if (markupOrderMismatch(source, target)) {
    const labels = uniqueSorted(markupTokensInOrder(source.tokens).map(tokenDisplayName));
    issues.push({
      kind: "token-order",
      tokens: labels,
    });
  }

  if (!source.parseError && !target.parseError) {
    const missingIcuBlocks = findMissingTokens(
      source.tokens.filter((token) => token.kind === "icu"),
      target.tokens.filter((token) => token.kind === "icu"),
    );
    if (missingIcuBlocks.length > 0) {
      const labels = uniqueSorted(missingIcuBlocks.map(tokenDisplayName));
      issues.push({
        kind: "icu-mismatch",
        tokens: labels,
      });
    }
  }

  return issues;
}

export function missingCatMessageTokens(sourceMessage: string, targetMessage: string) {
  const source = analyzeCatMessageFormat(sourceMessage);
  const target = analyzeCatMessageFormat(targetMessage);
  const hasMarkup = analysisHasMarkup(source) || analysisHasMarkup(target);
  if ((source.parseError || target.parseError) && !hasMarkup) {
    return [];
  }

  const sourceTokens =
    source.parseError || target.parseError
      ? source.tokens.filter((token) => token.kind === "markup")
      : source.tokens;
  const targetTokens =
    source.parseError || target.parseError
      ? target.tokens.filter((token) => token.kind === "markup")
      : target.tokens;

  return findMissingTokens(sourceTokens, targetTokens).filter((token) => token.kind !== "pound");
}
