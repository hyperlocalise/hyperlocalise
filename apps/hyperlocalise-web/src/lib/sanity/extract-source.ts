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
import { isSanityInternationalizedArrayEntry } from "./internationalized-array";

const SKIP_TOP_LEVEL_KEYS = new Set([
  "_id",
  "_type",
  "_rev",
  "_createdAt",
  "_updatedAt",
  "_key",
  "language",
]);

function isReference(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "_ref" in (value as Record<string, unknown>)
  );
}

function isPortableTextBlock(value: unknown): value is {
  _type?: string;
  children?: unknown[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record._type === "block" && Array.isArray(record.children);
}

function extractPortableText(value: unknown, prefix: string, out: SanityTranslationMap): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (let blockIndex = 0; blockIndex < value.length; blockIndex += 1) {
    const block = value[blockIndex];
    if (!isPortableTextBlock(block)) {
      continue;
    }
    const children = block.children ?? [];
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex];
      if (!child || typeof child !== "object" || Array.isArray(child)) {
        continue;
      }
      const text = (child as { text?: unknown }).text;
      if (typeof text === "string" && text.length > 0) {
        out[`${prefix}.${blockIndex}.children.${childIndex}.text`] = text;
      }
    }
  }
}

function walkValue(value: unknown, prefix: string, out: SanityTranslationMap): void {
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
  if (isReference(value)) {
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
  const record = value as Record<string, unknown>;
  if (record._type && record._type !== "block" && typeof record._type === "string") {
    if (record._type === "image" || record._type === "file" || record._type === "slug") {
      return;
    }
  }
  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith("_")) {
      continue;
    }
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    walkValue(child, nextPrefix, out);
  }
}

export function extractFieldLevelLocaleValue(
  fieldValue: unknown,
  sanityLocaleKey: string,
): unknown {
  if (!Array.isArray(fieldValue)) {
    return undefined;
  }
  for (const entry of fieldValue) {
    if (!isSanityInternationalizedArrayEntry(entry)) {
      continue;
    }
    if (typeof entry.language === "string" && entry.language === sanityLocaleKey) {
      return entry.value;
    }
  }
  return undefined;
}

export function extractSanityDocumentSourceMap(input: {
  document: Record<string, unknown>;
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
  document: Record<string, unknown>;
  i18nMode: "document" | "field";
  targetSanityLocale: string;
}): SanityTranslationMap {
  return extractSanityDocumentSourceMap({
    document: input.document,
    i18nMode: input.i18nMode,
    sourceSanityLocale: input.targetSanityLocale,
  });
}
