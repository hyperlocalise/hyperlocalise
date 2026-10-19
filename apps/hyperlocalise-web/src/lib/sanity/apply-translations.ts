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
    return;
  }
  if (path.length >= 4 && path[path.length - 1] === "text") {
    const textParent = current as Record<string, unknown>;
    const existing = textParent[lastKey];
    if (typeof existing === "string") {
      textParent[lastKey] = value;
    }
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

function upsertInternationalizedEntry(
  entries: unknown[],
  language: string,
  value: unknown,
): unknown[] {
  const next = [...entries];
  const index = next.findIndex(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      (entry as { language?: unknown }).language === language,
  );
  const row = { _type: "internationalizedArrayStringValue", language, value };
  if (index >= 0) {
    next[index] = { ...(next[index] as object), ...row };
  } else {
    next.push(row);
  }
  return next;
}

export function applySanityTranslationsToDocument(input: {
  document: Record<string, unknown>;
  i18nMode: "document" | "field";
  targetSanityLocale: string;
  translations: SanityTranslationMap;
}): Record<string, unknown> {
  if (input.i18nMode === "document") {
    const next = applyToDocumentRoot(input.document, input.translations);
    next.language = input.targetSanityLocale;
    return next;
  }

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
    let localeValue: unknown;
    if (map[""] !== undefined && Object.keys(map).length === 1) {
      localeValue = map[""];
    } else {
      const base =
        Array.isArray(existing) && existing.length > 0
          ? extractFieldLevelBase(existing, input.targetSanityLocale)
          : {};
      localeValue = applyToDocumentRoot(base as Record<string, unknown>, map);
    }
    const entries = Array.isArray(existing) ? existing : [];
    clone[field] = upsertInternationalizedEntry(entries, input.targetSanityLocale, localeValue);
  }

  return clone;
}

function extractFieldLevelBase(entries: unknown[], targetLocale: string): Record<string, unknown> {
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as { language?: unknown; value?: unknown };
    if (record.language === targetLocale && record.value && typeof record.value === "object") {
      return structuredClone(record.value as Record<string, unknown>);
    }
  }
  return {};
}
