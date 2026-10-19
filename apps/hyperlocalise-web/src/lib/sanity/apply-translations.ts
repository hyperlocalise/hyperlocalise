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

function setAtPath(root: Record<string, unknown>, path: string[], value: string): void {
  if (path.length === 0) {
    return;
  }
  let current: unknown = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]!;
    const segment = current as Record<string, unknown>;
    const next = segment[key];
    if (next === undefined || next === null) {
      return;
    }
    current = next;
  }
  const lastKey = path[path.length - 1]!;
  const parent = current as Record<string, unknown>;
  if (typeof parent[lastKey] === "string") {
    parent[lastKey] = value;
  }
}

function applyToDocumentRoot(
  document: Record<string, unknown>,
  translations: SanityTranslationMap,
): Record<string, unknown> {
  const clone = structuredClone(document);
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
  existing: unknown[];
  map: SanityTranslationMap;
  targetSanityLocale: string;
  sourceSanityLocale?: string;
}): unknown {
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
  const template =
    targetValue && typeof targetValue === "object" && !Array.isArray(targetValue)
      ? structuredClone(targetValue as Record<string, unknown>)
      : sourceValue && typeof sourceValue === "object" && !Array.isArray(sourceValue)
        ? structuredClone(sourceValue as Record<string, unknown>)
        : {};
  return applyToDocumentRoot(template, input.map);
}

function applyFieldLevelTranslations(input: {
  document: Record<string, unknown>;
  targetSanityLocale: string;
  sourceSanityLocale?: string;
  translations: SanityTranslationMap;
}): Record<string, unknown> {
  const clone = structuredClone(input.document);
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
    clone[field] = upsertSanityInternationalizedEntry(
      existing,
      input.targetSanityLocale,
      fieldLevelLocaleValue({
        existing,
        map,
        targetSanityLocale: input.targetSanityLocale,
        sourceSanityLocale: input.sourceSanityLocale,
      }),
    );
  }

  return clone;
}

export function applySanityTranslationsToDocument(input: {
  document: Record<string, unknown>;
  i18nMode: "document" | "field";
  targetSanityLocale: string;
  sourceSanityLocale?: string;
  translations: SanityTranslationMap;
}): Record<string, unknown> {
  if (input.i18nMode === "document") {
    const next = applyToDocumentRoot(input.document, input.translations);
    next.language = input.targetSanityLocale;
    return next;
  }

  return applyFieldLevelTranslations(input);
}
