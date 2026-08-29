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

/** Families match Go sentinels: HLMDPH (markdown), HLHTPH (HTML), HLLQPH (Liquid). */
export type ContentEditorInternalMarkupFamily = "MD" | "HT" | "LQ";

export interface ContentEditorInternalMarkupSpan {
  family: ContentEditorInternalMarkupFamily;
  index: number;
  literal: string;
  start: number;
  end: number;
  label: string;
}

// RS/US delimiters match Go HLMDPH / HLHTPH / HLLQPH sentinels (\x1e...\x1f).
const INTERNAL_MARKUP_PATTERN = new RegExp(
  `${String.fromCharCode(0x1e)}HL(MD|HT|LQ)PH_[A-Z0-9]+_(\\d+)${String.fromCharCode(0x1f)}`,
  "g",
);

function familyFromMatch(raw: string): ContentEditorInternalMarkupFamily {
  switch (raw) {
    case "MD":
      return "MD";
    case "HT":
      return "HT";
    case "LQ":
      return "LQ";
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

/** Replace sentinels with short labels for plain-text UI (queue rows, etc.). */
export function formatInternalMarkupForDisplay(message: string): string {
  return message.replace(INTERNAL_MARKUP_PATTERN, (_literal, family: string, index: string) =>
    internalMarkupLabel(familyFromMatch(family), Number.parseInt(index, 10)),
  );
}

export function hasInternalMarkup(message: string): boolean {
  INTERNAL_MARKUP_PATTERN.lastIndex = 0;
  return INTERNAL_MARKUP_PATTERN.test(message);
}
