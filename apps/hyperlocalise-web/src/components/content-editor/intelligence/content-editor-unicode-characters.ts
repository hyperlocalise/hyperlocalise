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

export type ContentEditorUnicodeCharacter = {
  char: string;
  codePoint: number;
  invisible: boolean;
  keywords: readonly string[];
  name: string;
  shortLabel: string;
};

function unicodeCharacter(
  codePoint: number,
  name: string,
  shortLabel: string,
  keywords: readonly string[] = [],
  invisible = false,
): ContentEditorUnicodeCharacter {
  return {
    char: String.fromCodePoint(codePoint),
    codePoint,
    invisible,
    keywords,
    name,
    shortLabel,
  };
}

/**
 * Translator-essential characters, matching Crowdin's "Commonly used" set:
 * spacing, typographic quotes, dashes, currency, legal marks, and Latin-1
 * symbols. Accented letters that belong on a keyboard are omitted.
 */
export const COMMONLY_USED_UNICODE_CHARACTERS: readonly ContentEditorUnicodeCharacter[] = [
  unicodeCharacter(0x00a0, "NO-BREAK SPACE", "NBSP", ["nbsp", "non-breaking space"], true),
  unicodeCharacter(0x2013, "EN DASH", "–", ["dash", "range"]),
  unicodeCharacter(0x2014, "EM DASH", "—", ["dash"]),
  unicodeCharacter(0x2018, "LEFT SINGLE QUOTATION MARK", "‘", ["quote", "apostrophe"]),
  unicodeCharacter(0x2019, "RIGHT SINGLE QUOTATION MARK", "’", ["quote", "apostrophe"]),
  unicodeCharacter(0x201a, "SINGLE LOW-9 QUOTATION MARK", "‚", ["quote"]),
  unicodeCharacter(0x201c, "LEFT DOUBLE QUOTATION MARK", "“", ["quote"]),
  unicodeCharacter(0x201d, "RIGHT DOUBLE QUOTATION MARK", "”", ["quote"]),
  unicodeCharacter(0x201e, "DOUBLE LOW-9 QUOTATION MARK", "„", ["quote"]),
  unicodeCharacter(0x2039, "SINGLE LEFT-POINTING ANGLE QUOTATION MARK", "‹", ["quote"]),
  unicodeCharacter(0x203a, "SINGLE RIGHT-POINTING ANGLE QUOTATION MARK", "›", ["quote"]),
  unicodeCharacter(0x00a1, "INVERTED EXCLAMATION MARK", "¡"),
  unicodeCharacter(0x00a2, "CENT SIGN", "¢", ["currency"]),
  unicodeCharacter(0x00a3, "POUND SIGN", "£", ["currency", "gbp"]),
  unicodeCharacter(0x00a4, "CURRENCY SIGN", "¤", ["currency"]),
  unicodeCharacter(0x00a5, "YEN SIGN", "¥", ["currency", "yuan"]),
  unicodeCharacter(0x20ac, "EURO SIGN", "€", ["currency", "euro"]),
  unicodeCharacter(0x00a6, "BROKEN BAR", "¦"),
  unicodeCharacter(0x00a7, "SECTION SIGN", "§"),
  unicodeCharacter(0x00a8, "DIAERESIS", "¨"),
  unicodeCharacter(0x00a9, "COPYRIGHT SIGN", "©", ["legal"]),
  unicodeCharacter(0x00aa, "FEMININE ORDINAL INDICATOR", "ª"),
  unicodeCharacter(0x00ab, "LEFT-POINTING DOUBLE ANGLE QUOTATION MARK", "«", [
    "quote",
    "guillemet",
  ]),
  unicodeCharacter(0x00ac, "NOT SIGN", "¬"),
  unicodeCharacter(0x00ad, "SOFT HYPHEN", "SHY", ["hyphen", "shy"], true),
  unicodeCharacter(0x00ae, "REGISTERED SIGN", "®", ["legal"]),
  unicodeCharacter(0x00af, "MACRON", "¯"),
  unicodeCharacter(0x00b0, "DEGREE SIGN", "°"),
  unicodeCharacter(0x00b1, "PLUS-MINUS SIGN", "±"),
  unicodeCharacter(0x00b2, "SUPERSCRIPT TWO", "²"),
  unicodeCharacter(0x00b3, "SUPERSCRIPT THREE", "³"),
  unicodeCharacter(0x00b4, "ACUTE ACCENT", "´"),
  unicodeCharacter(0x00b5, "MICRO SIGN", "µ"),
  unicodeCharacter(0x00b6, "PILCROW SIGN", "¶"),
  unicodeCharacter(0x00b7, "MIDDLE DOT", "·"),
  unicodeCharacter(0x00b8, "CEDILLA", "¸"),
  unicodeCharacter(0x00b9, "SUPERSCRIPT ONE", "¹"),
  unicodeCharacter(0x00ba, "MASCULINE ORDINAL INDICATOR", "º"),
  unicodeCharacter(0x00bb, "RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK", "»", [
    "quote",
    "guillemet",
  ]),
  unicodeCharacter(0x00bc, "VULGAR FRACTION ONE QUARTER", "¼", ["fraction"]),
  unicodeCharacter(0x00bd, "VULGAR FRACTION ONE HALF", "½", ["fraction"]),
  unicodeCharacter(0x00be, "VULGAR FRACTION THREE QUARTERS", "¾", ["fraction"]),
  unicodeCharacter(0x00bf, "INVERTED QUESTION MARK", "¿"),
  unicodeCharacter(0x00d7, "MULTIPLICATION SIGN", "×"),
  unicodeCharacter(0x00f7, "DIVISION SIGN", "÷"),
  unicodeCharacter(0x2011, "NON-BREAKING HYPHEN", "NBHY", ["hyphen"], true),
  unicodeCharacter(0x2022, "BULLET", "•"),
  unicodeCharacter(0x2026, "HORIZONTAL ELLIPSIS", "…", ["ellipsis"]),
  unicodeCharacter(0x202f, "NARROW NO-BREAK SPACE", "NNBSP", ["nbsp", "french"], true),
  unicodeCharacter(0x2122, "TRADE MARK SIGN", "™", ["legal", "trademark"]),
];

export function formatUnicodeCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function filterUnicodeCharacters(
  characters: readonly ContentEditorUnicodeCharacter[],
  query: string,
): ContentEditorUnicodeCharacter[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [...characters];
  }

  const compact = normalized.replace(/[\s+_]/g, "");
  const hexQuery = compact.replace(/^u\+?/, "");

  return characters.filter((character) => {
    const code = formatUnicodeCodePoint(character.codePoint).toLowerCase();
    const hex = character.codePoint.toString(16).toLowerCase();
    if (character.char === query || character.shortLabel.toLowerCase() === normalized) {
      return true;
    }
    if (character.name.toLowerCase().includes(normalized)) {
      return true;
    }
    if (character.shortLabel.toLowerCase().includes(normalized)) {
      return true;
    }
    if (code.includes(compact) || hex.includes(hexQuery)) {
      return true;
    }
    return character.keywords.some((keyword) => keyword.toLowerCase().includes(normalized));
  });
}
