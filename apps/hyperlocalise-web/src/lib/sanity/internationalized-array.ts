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

const DEFAULT_INTERNATIONALIZED_ITEM_TYPE = "internationalizedArrayStringValue";

export type SanityInternationalizedArrayEntry = {
  _type: string;
  language?: unknown;
  value?: unknown;
  _key?: unknown;
};

export function isSanityInternationalizedArrayEntry(
  value: unknown,
): value is SanityInternationalizedArrayEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as { _type?: unknown; language?: unknown; value?: unknown };
  if (!("language" in record) || !("value" in record)) {
    return false;
  }
  return typeof record._type === "string" && record._type.startsWith("internationalizedArray");
}

export function isSanityInternationalizedArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.some(isSanityInternationalizedArrayEntry);
}

function normalizeLocaleTag(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

export function sanityInternationalizedEntryLanguage(
  entry: SanityInternationalizedArrayEntry,
): string | null {
  return typeof entry.language === "string" && entry.language.trim() ? entry.language.trim() : null;
}

export function findSanityInternationalizedEntryIndex(
  entries: readonly unknown[],
  language: string,
): number {
  const wanted = normalizeLocaleTag(language);
  if (!wanted) {
    return -1;
  }
  return entries.findIndex((entry) => {
    if (!isSanityInternationalizedArrayEntry(entry)) {
      return false;
    }
    const entryLanguage = sanityInternationalizedEntryLanguage(entry);
    return entryLanguage !== null && normalizeLocaleTag(entryLanguage) === wanted;
  });
}

export function readSanityInternationalizedEntryValue(
  entries: readonly unknown[],
  language: string,
): unknown {
  const index = findSanityInternationalizedEntryIndex(entries, language);
  if (index < 0) {
    return undefined;
  }
  const entry = entries[index];
  if (!isSanityInternationalizedArrayEntry(entry)) {
    return undefined;
  }
  return entry.value;
}

export function upsertSanityInternationalizedEntry(
  entries: unknown[],
  language: string,
  value: unknown,
): unknown[] {
  const next = [...entries];
  const index = findSanityInternationalizedEntryIndex(next, language);
  const sibling = next.find(isSanityInternationalizedArrayEntry);
  const itemType =
    (index >= 0 && isSanityInternationalizedArrayEntry(next[index])
      ? next[index]._type
      : sibling?._type) || DEFAULT_INTERNATIONALIZED_ITEM_TYPE;
  const existingKey =
    index >= 0 &&
    isSanityInternationalizedArrayEntry(next[index]) &&
    typeof next[index]._key === "string"
      ? next[index]._key
      : language;

  if (index >= 0 && isSanityInternationalizedArrayEntry(next[index])) {
    next[index] = {
      ...next[index],
      _type: itemType,
      _key: existingKey,
      language,
      value,
    };
    return next;
  }

  next.push({
    _type: itemType,
    _key: language,
    language,
    value,
  });
  return next;
}
