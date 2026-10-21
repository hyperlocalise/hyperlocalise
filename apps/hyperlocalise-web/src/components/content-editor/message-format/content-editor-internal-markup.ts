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
 * Families match Go sentinels: HLMDPH (markdown), HLHTPH (HTML), HLLQPH (Liquid), HLUEPH (Unreal PO),
 * HLOXPH (Word and PowerPoint run formatting).
 */
export type ContentEditorInternalMarkupFamily = "MD" | "HT" | "LQ" | "UE" | "OX";

export interface ContentEditorInternalMarkupSpan {
  family: ContentEditorInternalMarkupFamily;
  index: number;
  literal: string;
  start: number;
  end: number;
  label: string;
}

// RS/US delimiters match Go HLMDPH / HLHTPH / HLLQPH / HLUEPH / HLOXPH sentinels (\x1e...\x1f).
const INTERNAL_MARKUP_PATTERN = new RegExp(
  `${String.fromCharCode(0x1e)}HL(MD|HT|LQ|UE|OX)PH_[A-Z0-9]+_(\\d+)${String.fromCharCode(0x1f)}`,
  "g",
);

const LEAKED_INTERNAL_TOKEN_NAME = /[^\S\n]*HL(?:MD|HT|LQ|UE|OX)PH_[A-Z0-9]+_[0-9]+[^\S\n]*/g;
const EXTRA_HORIZONTAL_SPACE = /[^\S\n]{2,}/g;

function familyFromMatch(raw: string): ContentEditorInternalMarkupFamily {
  switch (raw) {
    case "MD":
      return "MD";
    case "HT":
      return "HT";
    case "LQ":
      return "LQ";
    case "UE":
      return "UE";
    case "OX":
      return "OX";
    default:
      return "MD";
  }
}

export function internalMarkupLabel(family: ContentEditorInternalMarkupFamily, index: number) {
  return `${family}#${index}`;
}

/** Extract Hyperlocalise internal markup sentinels from a segment string. */
export function extractInternalMarkupSpans(message: string): ContentEditorInternalMarkupSpan[] {
  const spans: ContentEditorInternalMarkupSpan[] = [];
  for (const match of message.matchAll(INTERNAL_MARKUP_PATTERN)) {
    const literal = match[0];
    const family = familyFromMatch(match[1] ?? "MD");
    const index = Number.parseInt(match[2] ?? "0", 10);
    const start = match.index ?? 0;
    spans.push({
      family,
      index,
      literal,
      start,
      end: start + literal.length,
      label: internalMarkupLabel(family, index),
    });
  }
  return spans;
}

/** Drops token names that a model copied as visible text next to real sentinels. */
export function stripLeakedInternalMarkupNames(text: string): string {
  if (!text.includes("HL")) {
    return text;
  }
  const stripped = text.replace(LEAKED_INTERNAL_TOKEN_NAME, (match, offset: number) =>
    leakedInternalTokenReplacement(text, match, offset),
  );
  return stripped.replace(EXTRA_HORIZONTAL_SPACE, " ");
}

/** Keeps `\x1eHL*PH…\x1f` sentinels and removes copied token names between them. */
export function stripLeakedInternalMarkupFromStoredMessage(message: string): string {
  if (!message.includes("HL")) {
    return message;
  }
  const spans = extractInternalMarkupSpans(message);
  if (spans.length === 0) {
    return stripLeakedInternalMarkupNames(message);
  }
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += stripLeakedInternalMarkupNames(message.slice(cursor, span.start));
    out += span.literal;
    cursor = span.end;
  }
  return out + stripLeakedInternalMarkupNames(message.slice(cursor));
}

function leakedInternalTokenReplacement(text: string, match: string, offset: number): string {
  const end = offset + match.length;
  const leadSpace = match.startsWith(" ") || match.startsWith("\t");
  const trailSpace = match.endsWith(" ") || match.endsWith("\t");
  if (leadSpace && trailSpace) {
    return " ";
  }
  if (leadSpace && /\p{L}/u.test(text[end] ?? "")) {
    return " ";
  }
  if (trailSpace && offset > 0 && /\p{L}/u.test(text[offset - 1] ?? "")) {
    return " ";
  }
  return "";
}

/** Replace sentinels with short labels for plain-text UI (queue rows, etc.). */
export function formatInternalMarkupForDisplay(message: string): string {
  return stripLeakedInternalMarkupNames(
    message.replace(INTERNAL_MARKUP_PATTERN, (_literal, family: string, index: string) =>
      internalMarkupLabel(familyFromMatch(family), Number.parseInt(index, 10)),
    ),
  );
}

export function hasInternalMarkup(message: string): boolean {
  INTERNAL_MARKUP_PATTERN.lastIndex = 0;
  return INTERNAL_MARKUP_PATTERN.test(message);
}
