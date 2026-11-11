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
  isSanityInternationalizedArrayEntry,
  readSanityInternationalizedEntryValue,
} from "./internationalized-array";
import type { SanityDocumentRecord, SanityFieldValue } from "./sanity-field-value";
import { isPortableTextBlock, isSanityFieldObject, isSanityReference } from "./sanity-field-value";

const SKIP_TOP_LEVEL_KEYS = new Set([
  "_id",
  "_type",
  "_rev",
  "_createdAt",
  "_updatedAt",
  "_key",
  "language",
]);

function extractPortableText(
  value: SanityFieldValue[],
  prefix: string,
  out: SanityTranslationMap,
): void {
  for (let blockIndex = 0; blockIndex < value.length; blockIndex += 1) {
    const block = value[blockIndex];
    if (!isPortableTextBlock(block)) {
      continue;
    }
    const children = block.children ?? [];
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex];
      if (!child || !isSanityFieldObject(child)) {
        continue;
      }
      const text = child.text;
      if (typeof text === "string" && text.length > 0) {
        out[`${prefix}.${blockIndex}.children.${childIndex}.text`] = text;
      }
    }
  }
}

function walkValue(
  value: SanityFieldValue | undefined,
  prefix: string,
  out: SanityTranslationMap,
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    if (value.length > 0) {
      out[prefix] = value;
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (isSanityReference(value)) {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isSanityInternationalizedArrayEntry)) {
      return;
    }
    if (value.some(isPortableTextBlock)) {
      extractPortableText(value, prefix, out);
      return;
    }
    for (let index = 0; index < value.length; index += 1) {
      walkValue(value[index], `${prefix}.${index}`, out);
    }
    return;
  }
  if (!isSanityFieldObject(value)) {
    return;
  }
  if (value._type && value._type !== "block" && typeof value._type === "string") {
    if (value._type === "image" || value._type === "file" || value._type === "slug") {
      return;
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("_")) {
      continue;
    }
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    walkValue(child, nextPrefix, out);
  }
}

export function extractFieldLevelLocaleValue(
  fieldValue: SanityFieldValue,
  sanityLocaleKey: string,
): SanityFieldValue | undefined {
  if (!Array.isArray(fieldValue)) {
    return undefined;
  }
  return readSanityInternationalizedEntryValue(fieldValue, sanityLocaleKey);
}

export function extractSanityDocumentSourceMap(input: {
  document: SanityDocumentRecord;
  i18nMode: "document" | "field";
  sourceSanityLocale: string;
}): SanityTranslationMap {
  const out: SanityTranslationMap = {};
  for (const [key, value] of Object.entries(input.document)) {
    if (SKIP_TOP_LEVEL_KEYS.has(key) || key.startsWith("_")) {
      continue;
    }
    if (input.i18nMode === "field") {
      const localeValue = extractFieldLevelLocaleValue(value, input.sourceSanityLocale);
      if (localeValue === undefined) {
        continue;
      }
      if (typeof localeValue === "string") {
        if (localeValue.length > 0) {
          out[key] = localeValue;
        }
        continue;
      }
      walkValue(localeValue, key, out);
      continue;
    }
    walkValue(value, key, out);
  }
  return out;
}

export function extractSanityTargetLocaleMap(input: {
  document: SanityDocumentRecord;
  i18nMode: "document" | "field";
  targetSanityLocale: string;
}): SanityTranslationMap {
  return extractSanityDocumentSourceMap({
    document: input.document,
    i18nMode: input.i18nMode,
    sourceSanityLocale: input.targetSanityLocale,
  });
}
