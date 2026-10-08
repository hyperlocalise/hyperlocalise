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

import { parseIntercomArticleMarkdown, type IntercomArticleFields } from "./article-markdown";

export const INTERCOM_ARTICLE_TITLE_KEY_ALIASES = [
  "md.frontmatter/title",
  "frontmatter/title",
] as const;

export const INTERCOM_ARTICLE_DESCRIPTION_KEY_ALIASES = [
  "md.frontmatter/description",
  "frontmatter/description",
] as const;

export type IntercomApprovedKeyedUnit = {
  key: string;
  sourceText: string;
  targetText: string;
  isHidden?: boolean;
};

const INTERNAL_MARKUP_PATTERN = new RegExp(
  `${String.fromCharCode(0x1e)}HL(?:MD|HT|LQ|UE)PH_[0-9A-Fa-f]+_\\d+${String.fromCharCode(0x1f)}`,
  "g",
);

type MarkupToken = { kind: "text"; value: string } | { kind: "markup"; value: string };

export function readIntercomArticleFieldFromKeys(
  values: Readonly<Record<string, string>>,
  aliases: readonly string[],
): string | undefined {
  for (const key of aliases) {
    const value = values[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export function composeIntercomArticleFromApprovedKeyedUnits(input: {
  sourceMarkdown: string;
  units: readonly IntercomApprovedKeyedUnit[];
}): IntercomArticleFields | null {
  const visibleUnits = input.units.filter((unit) => !unit.isHidden);
  if (
    visibleUnits.length === 0 ||
    visibleUnits.some((unit) => unit.targetText.trim().length === 0)
  ) {
    return null;
  }

  const applied = applyApprovedKeyedUnitsToMarkdown(input.sourceMarkdown, input.units);
  if (applied == null) {
    return null;
  }

  const parsed = parseIntercomArticleMarkdown(applied);
  const byKey = Object.fromEntries(input.units.map((unit) => [unit.key, unit.targetText]));
  const approvedTitle = readIntercomArticleFieldFromKeys(byKey, INTERCOM_ARTICLE_TITLE_KEY_ALIASES);
  const title = parsed.title.trim() || approvedTitle;
  const description =
    parsed.description.trim() ||
    readIntercomArticleFieldFromKeys(byKey, INTERCOM_ARTICLE_DESCRIPTION_KEY_ALIASES) ||
    "";
  const body = parsed.body;
  if (!approvedTitle || !title || !body.trim()) {
    return null;
  }

  return { title, description, body };
}

export function applyApprovedKeyedUnitsToMarkdown(
  sourceMarkdown: string,
  units: readonly IntercomApprovedKeyedUnit[],
): string | null {
  const remaining = units.filter((unit) => unit.sourceText.length > 0);
  let output = sourceMarkdown;
  let cursor = 0;

  while (remaining.length > 0) {
    let best: {
      index: number;
      start: number;
      end: number;
      replacement: string;
    } | null = null;

    for (let index = 0; index < remaining.length; index += 1) {
      const found = findKeyedUnitInMarkdown(output, cursor, remaining[index]!);
      if (!found) {
        continue;
      }
      const length = found.end - found.start;
      const bestLength = best ? best.end - best.start : -1;
      if (
        !best ||
        found.start < best.start ||
        (found.start === best.start && length > bestLength)
      ) {
        best = { index, ...found };
      }
    }

    if (!best) {
      return null;
    }

    output = `${output.slice(0, best.start)}${best.replacement}${output.slice(best.end)}`;
    cursor = best.start + best.replacement.length;
    remaining.splice(best.index, 1);
  }

  return output;
}

function findKeyedUnitInMarkdown(
  markdown: string,
  cursor: number,
  unit: IntercomApprovedKeyedUnit,
): { start: number; end: number; replacement: string } | null {
  const tokens = tokenizeInternalMarkup(unit.sourceText);
  const hasMarkup = tokens.some((token) => token.kind === "markup");
  if (!hasMarkup) {
    const start = markdown.indexOf(unit.sourceText, cursor);
    if (start < 0) {
      return null;
    }
    return {
      start,
      end: start + unit.sourceText.length,
      replacement: unit.targetText,
    };
  }

  const match = findMarkupTokenSequence(markdown, cursor, tokens);
  if (!match) {
    return null;
  }

  const replacement = expandTargetMarkup(unit.targetText, match.expansions);
  if (replacement == null) {
    return null;
  }

  return {
    start: match.start,
    end: match.end,
    replacement,
  };
}

function findMarkupTokenSequence(
  markdown: string,
  cursor: number,
  tokens: readonly MarkupToken[],
): { start: number; end: number; expansions: Map<string, string> } | null {
  const expansions = new Map<string, string>();
  let pos = cursor;
  let start = -1;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind === "text") {
      if (token.value.length === 0) {
        continue;
      }
      const found = markdown.indexOf(token.value, pos);
      if (found < 0) {
        return null;
      }
      if (start < 0) {
        start = found;
      }
      const previous = index > 0 ? tokens[index - 1] : undefined;
      if (previous?.kind === "markup") {
        expansions.set(previous.value, markdown.slice(pos, found));
      }
      pos = found + token.value.length;
      continue;
    }

    if (index === tokens.length - 1) {
      if (start < 0) {
        return null;
      }
      const trailingEnd = matchTrailingMarkdownDelimiter(markdown, pos);
      expansions.set(token.value, markdown.slice(pos, trailingEnd));
      pos = trailingEnd;
    }
  }

  if (start < 0) {
    return null;
  }

  const first = tokens.find((token) => token.kind === "markup" || token.value.length > 0);
  if (first?.kind === "markup") {
    const leadingStart = matchLeadingMarkdownDelimiter(markdown, start);
    expansions.set(first.value, markdown.slice(leadingStart, start));
    start = leadingStart;
  }

  return { start, end: pos, expansions };
}

function expandTargetMarkup(targetText: string, expansions: Map<string, string>): string | null {
  if (!hasInternalMarkup(targetText)) {
    return targetText;
  }

  let expanded = targetText;
  for (const [token, literal] of expansions) {
    expanded = expanded.split(token).join(literal);
  }
  if (hasInternalMarkup(expanded)) {
    return null;
  }
  return expanded;
}

function tokenizeInternalMarkup(value: string): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  let cursor = 0;
  for (const match of value.matchAll(INTERNAL_MARKUP_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: "text", value: value.slice(cursor, start) });
    }
    tokens.push({ kind: "markup", value: match[0] });
    cursor = start + match[0].length;
  }
  if (cursor < value.length || tokens.length === 0) {
    tokens.push({ kind: "text", value: value.slice(cursor) });
  }
  return tokens;
}

function matchLeadingMarkdownDelimiter(markdown: string, textStart: number): number {
  if (textStart >= 2 && markdown.slice(textStart - 2, textStart) === "![") {
    return textStart - 2;
  }
  if (textStart >= 1 && markdown[textStart - 1] === "[") {
    return textStart - 1;
  }
  return textStart;
}

function matchTrailingMarkdownDelimiter(markdown: string, pos: number): number {
  const slice = markdown.slice(pos);
  const destination = /^\]\([^)]*\)/.exec(slice) ?? /^\]\[[^\]]*\]/.exec(slice);
  if (destination) {
    return pos + destination[0].length;
  }
  const headingId = /^\s*\{#[^}]+\}/.exec(slice);
  if (headingId) {
    return pos + headingId[0].length;
  }
  return pos;
}

function hasInternalMarkup(value: string): boolean {
  INTERNAL_MARKUP_PATTERN.lastIndex = 0;
  return INTERNAL_MARKUP_PATTERN.test(value);
}
