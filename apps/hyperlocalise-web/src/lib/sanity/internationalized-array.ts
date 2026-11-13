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

import type { SanityDocumentRecord, SanityFieldValue } from "./sanity-field-value";

const DEFAULT_INTERNATIONALIZED_ITEM_TYPE = "internationalizedArrayStringValue";

export type SanityInternationalizedArrayEntry = {
  _type: string;
  language?: string;
  value?: SanityFieldValue;
  _key?: string;
};

export function isSanityInternationalizedArrayEntry(
  value: SanityFieldValue,
): value is SanityInternationalizedArrayEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<SanityInternationalizedArrayEntry>;
  if (!("value" in record)) {
    return false;
  }
  if (typeof record._type !== "string" || !record._type.startsWith("internationalizedArray")) {
    return false;
  }
  const hasLanguage = typeof record.language === "string" && record.language.trim().length > 0;
  const hasKey = typeof record._key === "string" && record._key.trim().length > 0;
  return hasLanguage || hasKey;
}

export function isSanityInternationalizedArray(
  value: SanityFieldValue,
): value is SanityInternationalizedArrayEntry[] {
  return Array.isArray(value) && value.some(isSanityInternationalizedArrayEntry);
}

/** Collect locale tags from internationalized-array fields on one document. */
export function collectInternationalizedArrayLanguages(doc: SanityDocumentRecord): string[] {
  const languages = new Set<string>();
  for (const value of Object.values(doc)) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const entry of value) {
      if (!isSanityInternationalizedArrayEntry(entry)) {
        continue;
      }
      const language = sanityInternationalizedEntryLanguage(entry);
      if (language) {
        languages.add(language);
      }
    }
  }
  return [...languages];
}

function normalizeLocaleTag(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

export function sanityInternationalizedEntryLanguage(
  entry: SanityInternationalizedArrayEntry,
): string | null {
  if (typeof entry.language === "string" && entry.language.trim()) {
    return entry.language.trim();
  }
  if (typeof entry._key === "string" && entry._key.trim()) {
    return entry._key.trim();
  }
  return null;
}

function sanityInternationalizedEntriesUseLanguageField(
  entries: readonly SanityInternationalizedArrayEntry[],
): boolean {
  return entries.some(
    (entry) => typeof entry.language === "string" && entry.language.trim().length > 0,
  );
}

function asInternationalizedEntries(
  entries: readonly SanityFieldValue[],
): SanityInternationalizedArrayEntry[] {
  return entries.filter(isSanityInternationalizedArrayEntry);
}

export function findSanityInternationalizedEntryIndex(
  entries: readonly SanityFieldValue[],
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
  entries: readonly SanityFieldValue[],
  language: string,
): SanityFieldValue | undefined {
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
  entries: SanityFieldValue[],
  language: string,
  value: SanityFieldValue,
): SanityFieldValue[] {
  const next = [...entries];
  const index = findSanityInternationalizedEntryIndex(next, language);
  const typedEntries = asInternationalizedEntries(next);
  const sibling = typedEntries[0];
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
  const includeLanguageField = sanityInternationalizedEntriesUseLanguageField(typedEntries);

  if (index >= 0 && isSanityInternationalizedArrayEntry(next[index])) {
    const updated: SanityInternationalizedArrayEntry = {
      ...next[index],
      _type: itemType,
      _key: existingKey,
      value,
    };
    if (includeLanguageField) {
      updated.language = language;
    } else {
      delete updated.language;
    }
    next[index] = updated;
    return next;
  }

  const created: SanityInternationalizedArrayEntry = {
    _type: itemType,
    _key: language,
    value,
  };
  if (includeLanguageField || typedEntries.length === 0) {
    created.language = language;
  }
  next.push(created);
  return next;
}
