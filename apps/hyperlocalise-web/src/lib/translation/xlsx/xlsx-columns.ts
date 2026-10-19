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

// Mirrors internal/i18n/translationfileparser/xlsx_columns.go so keys extracted here
// match the CLI. Keep both in sync.

export type XlsxColumnRole = "key" | "comment" | "maxLength";

const HEADER_SEPARATOR_PATTERN = /[^a-z0-9]+/g;
const LOCALE_SLUG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const BYTE_ORDER_MARK = "\ufeff";

const ROLE_HEADERS: ReadonlyMap<string, XlsxColumnRole> = new Map([
  ["key", "key"],
  ["id", "key"],
  ["context", "key"],
  ["string-id", "key"],
  ["string-key", "key"],
  ["comment", "comment"],
  ["comments", "comment"],
  ["note", "comment"],
  ["notes", "comment"],
  ["description", "comment"],
  ["length-limit", "maxLength"],
  ["string-length", "maxLength"],
  ["length", "maxLength"],
  ["limit", "maxLength"],
  ["max-length", "maxLength"],
  ["maxlength", "maxLength"],
  ["character-limit", "maxLength"],
  ["char-limit", "maxLength"],
  ["max-length-chars", "maxLength"],
]);

const LANGUAGE_NAMES: ReadonlyMap<string, string> = new Map([
  ["afrikaans", "af"],
  ["albanian", "sq"],
  ["amharic", "am"],
  ["arabic", "ar"],
  ["armenian", "hy"],
  ["azerbaijani", "az"],
  ["basque", "eu"],
  ["belarusian", "be"],
  ["bengali", "bn"],
  ["bosnian", "bs"],
  ["bulgarian", "bg"],
  ["catalan", "ca"],
  ["chinese", "zh"],
  ["chinese-simplified", "zh-hans"],
  ["simplified-chinese", "zh-hans"],
  ["chinese-traditional", "zh-hant"],
  ["traditional-chinese", "zh-hant"],
  ["croatian", "hr"],
  ["czech", "cs"],
  ["danish", "da"],
  ["dutch", "nl"],
  ["english", "en"],
  ["english-us", "en-us"],
  ["english-united-states", "en-us"],
  ["american-english", "en-us"],
  ["english-uk", "en-gb"],
  ["english-united-kingdom", "en-gb"],
  ["british-english", "en-gb"],
  ["estonian", "et"],
  ["filipino", "fil"],
  ["finnish", "fi"],
  ["french", "fr"],
  ["french-france", "fr-fr"],
  ["french-canada", "fr-ca"],
  ["canadian-french", "fr-ca"],
  ["galician", "gl"],
  ["georgian", "ka"],
  ["german", "de"],
  ["greek", "el"],
  ["gujarati", "gu"],
  ["hebrew", "he"],
  ["hindi", "hi"],
  ["hungarian", "hu"],
  ["icelandic", "is"],
  ["indonesian", "id"],
  ["irish", "ga"],
  ["italian", "it"],
  ["japanese", "ja"],
  ["kannada", "kn"],
  ["kazakh", "kk"],
  ["khmer", "km"],
  ["korean", "ko"],
  ["lao", "lo"],
  ["latvian", "lv"],
  ["lithuanian", "lt"],
  ["macedonian", "mk"],
  ["malay", "ms"],
  ["malayalam", "ml"],
  ["maltese", "mt"],
  ["marathi", "mr"],
  ["mongolian", "mn"],
  ["burmese", "my"],
  ["nepali", "ne"],
  ["norwegian", "no"],
  ["norwegian-bokmal", "nb"],
  ["norwegian-bokm-l", "nb"],
  ["norwegian-nynorsk", "nn"],
  ["persian", "fa"],
  ["farsi", "fa"],
  ["polish", "pl"],
  ["portuguese", "pt"],
  ["portuguese-brazil", "pt-br"],
  ["brazilian-portuguese", "pt-br"],
  ["portuguese-portugal", "pt-pt"],
  ["punjabi", "pa"],
  ["romanian", "ro"],
  ["russian", "ru"],
  ["serbian", "sr"],
  ["sinhala", "si"],
  ["slovak", "sk"],
  ["slovenian", "sl"],
  ["spanish", "es"],
  ["spanish-spain", "es-es"],
  ["spanish-mexico", "es-mx"],
  ["spanish-latin-america", "es-419"],
  ["latin-american-spanish", "es-419"],
  ["swahili", "sw"],
  ["swedish", "sv"],
  ["tagalog", "tl"],
  ["tamil", "ta"],
  ["telugu", "te"],
  ["thai", "th"],
  ["turkish", "tr"],
  ["ukrainian", "uk"],
  ["urdu", "ur"],
  ["uzbek", "uz"],
  ["vietnamese", "vi"],
  ["welsh", "cy"],
  ["zulu", "zu"],
  ["chinese-simplified-china", "zh-hans"],
  ["chinese-traditional-taiwan", "zh-hant"],
]);

/** Folds region-based Chinese tags onto script tags so `zh-CN` matches "Chinese (Simplified)". */
const LOCALE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["zh-cn", "zh-hans"],
  ["zh-sg", "zh-hans"],
  ["zh-tw", "zh-hant"],
  ["zh-hk", "zh-hant"],
  ["zh-mo", "zh-hant"],
]);

const EXACT_MATCH_SCORE = 3;
const BASE_LANGUAGE_MATCH_SCORE = 2;
const MORE_SPECIFIC_MATCH_SCORE = 1;

/** Lowercases a header and collapses every run outside `a-z0-9` into one `-`. */
export function xlsxHeaderSlug(header: string): string {
  const withoutBom = header.startsWith(BYTE_ORDER_MARK) ? header.slice(1) : header;
  return withoutBom
    .trim()
    .toLowerCase()
    .replace(HEADER_SEPARATOR_PATTERN, "-")
    .replace(/^-+|-+$/g, "");
}

export function xlsxHeaderRole(header: string): XlsxColumnRole | null {
  return ROLE_HEADERS.get(xlsxHeaderSlug(header)) ?? null;
}

function canonicalLocale(slug: string): string {
  return LOCALE_ALIASES.get(slug) ?? slug;
}

/** The locale slug a header names, or `null` when the header is not a language column. */
export function xlsxHeaderLocale(header: string): string | null {
  const slug = xlsxHeaderSlug(header);
  if (!slug) {
    return null;
  }
  const named = LANGUAGE_NAMES.get(slug);
  if (named) {
    return named;
  }
  return LOCALE_SLUG_PATTERN.test(slug) ? canonicalLocale(slug) : null;
}

function localeBase(slug: string): string {
  const dash = slug.indexOf("-");
  return dash === -1 ? slug : slug.slice(0, dash);
}

function localeMatchScore(headerLocale: string | null, wantLocale: string): number {
  if (!headerLocale || !wantLocale) {
    return 0;
  }
  if (headerLocale === wantLocale) {
    return EXACT_MATCH_SCORE;
  }
  if (headerLocale === localeBase(wantLocale)) {
    return BASE_LANGUAGE_MATCH_SCORE;
  }
  if (localeBase(headerLocale) === wantLocale) {
    return MORE_SPECIFIC_MATCH_SCORE;
  }
  return 0;
}

export function sameXlsxLocale(left: string, right: string): boolean {
  return xlsxHeaderSlug(left) === xlsxHeaderSlug(right);
}

/** Role and locale columns read from a sheet's first row. Indexes are zero-based; -1 is absent. */
export type XlsxHeaderColumns = {
  key: number;
  comment: number;
  maxLength: number;
  headers: readonly string[];
};

export function resolveXlsxHeaderColumns(headers: readonly string[]): XlsxHeaderColumns {
  const columns: XlsxHeaderColumns = { key: -1, comment: -1, maxLength: -1, headers };
  headers.forEach((header, index) => {
    const role = xlsxHeaderRole(header);
    if (role && columns[role] < 0) {
      columns[role] = index;
    }
  });
  return columns;
}

/** The best locale column for `locale`, skipping role columns and `exclude`; -1 when none. */
export function xlsxLocaleColumn(
  columns: XlsxHeaderColumns,
  locale: string,
  exclude: readonly number[] = [],
): number {
  const want = canonicalLocale(xlsxHeaderSlug(locale));
  if (!want) {
    return -1;
  }
  let best = -1;
  let bestScore = 0;
  columns.headers.forEach((header, index) => {
    if (xlsxHeaderRole(header) || exclude.includes(index)) {
      return;
    }
    const score = localeMatchScore(xlsxHeaderLocale(header), want);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}
