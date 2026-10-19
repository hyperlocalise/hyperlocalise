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

import type { SanityTranslationMap } from "./document-json";
import {
  isSanityInternationalizedArray,
  readSanityInternationalizedEntryValue,
  upsertSanityInternationalizedEntry,
} from "./internationalized-array";
import type {
  SanityDocumentRecord,
  SanityFieldObject,
  SanityFieldValue,
} from "./sanity-field-value";
import { isSanityFieldObject } from "./sanity-field-value";

function setAtPath(root: SanityFieldObject, path: string[], value: string): void {
  if (path.length === 0) {
    return;
  }
  let current: SanityFieldValue = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]!;
    if (!isSanityFieldObject(current)) {
      return;
    }
    const next: SanityFieldValue | undefined = current[key];
    if (next === undefined || next === null) {
      return;
    }
    current = next;
  }
  const lastKey = path[path.length - 1]!;
  if (!isSanityFieldObject(current)) {
    return;
  }
  if (typeof current[lastKey] === "string") {
    current[lastKey] = value;
  }
}

function applyToDocumentRoot(
  document: SanityFieldObject,
  translations: SanityTranslationMap,
): SanityFieldObject {
  const clone = structuredClone(document) as SanityFieldObject;
  for (const [key, text] of Object.entries(translations)) {
    if (!key.includes(".")) {
      if (typeof clone[key] === "string") {
        clone[key] = text;
      }
      continue;
    }
    setAtPath(clone, key.split("."), text);
  }
  return clone;
}

function fieldLevelLocaleValue(input: {
  existing: SanityFieldValue[];
  map: SanityTranslationMap;
  targetSanityLocale: string;
  sourceSanityLocale?: string;
}): SanityFieldValue {
  if (input.map[""] !== undefined && Object.keys(input.map).length === 1) {
    return input.map[""];
  }

  const targetValue = readSanityInternationalizedEntryValue(
    input.existing,
    input.targetSanityLocale,
  );
  const sourceValue =
    input.sourceSanityLocale && input.sourceSanityLocale !== input.targetSanityLocale
      ? readSanityInternationalizedEntryValue(input.existing, input.sourceSanityLocale)
      : undefined;
  const template: SanityFieldObject =
    targetValue && isSanityFieldObject(targetValue)
      ? structuredClone(targetValue)
      : sourceValue && isSanityFieldObject(sourceValue)
        ? structuredClone(sourceValue)
        : {};
  return applyToDocumentRoot(template, input.map);
}

function applyFieldLevelTranslations(input: {
  document: SanityDocumentRecord;
  targetSanityLocale: string;
  sourceSanityLocale?: string;
  translations: SanityTranslationMap;
}): SanityDocumentRecord {
  const clone = structuredClone(input.document) as SanityDocumentRecord;
  const byField = new Map<string, SanityTranslationMap>();
  for (const [key, text] of Object.entries(input.translations)) {
    const dot = key.indexOf(".");
    const field = dot >= 0 ? key.slice(0, dot) : key;
    const suffix = dot >= 0 ? key.slice(dot + 1) : "";
    const bucket = byField.get(field) ?? {};
    if (suffix) {
      bucket[suffix] = text;
    } else {
      bucket[""] = text;
    }
    byField.set(field, bucket);
  }

  for (const [field, map] of byField) {
    const existing = clone[field];
    if (!isSanityInternationalizedArray(existing)) {
      continue;
    }
    const localeValue: SanityFieldValue = fieldLevelLocaleValue({
      existing,
      map,
      targetSanityLocale: input.targetSanityLocale,
      sourceSanityLocale: input.sourceSanityLocale,
    });
    clone[field] = upsertSanityInternationalizedEntry(
      existing,
      input.targetSanityLocale,
      localeValue,
    );
  }

  return clone;
}

export function applySanityTranslationsToDocument(input: {
  document: SanityDocumentRecord;
  i18nMode: "document" | "field";
  targetSanityLocale: string;
  sourceSanityLocale?: string;
  translations: SanityTranslationMap;
}): SanityDocumentRecord {
  if (input.i18nMode === "document") {
    const next = applyToDocumentRoot(input.document, input.translations);
    next.language = input.targetSanityLocale;
    return next;
  }

  return applyFieldLevelTranslations(input);
}
