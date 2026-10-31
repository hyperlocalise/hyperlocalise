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

import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

import type { HlEntriesPayload } from "./hl-entries";
import type { JsonImportSettings } from "./source-file-import-settings-schema";

const ICU_ARGUMENT = /\{[A-Za-z_]\w*(?:\s*,\s*(?:plural|select|selectordinal|number|date|time)\b)?/;
const HTML_TAG_HINT = /<(?:[A-Za-z][\w:-]*|\/|[!?])/;

export function isJsonTranslationSourcePath(sourcePath: string): boolean {
  const format = inferSupportedTranslationFileFormat(sourcePath);
  return format === "json" || format === "jsonc";
}

export function jsonKeyMatches(key: string, pattern: string): boolean {
  const trimmedKey = key.trim();
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return false;
  }
  if (trimmedPattern === "**" || trimmedPattern === "*") {
    return trimmedKey.length > 0;
  }
  return matchJsonPathSegments(splitJsonPath(trimmedKey), splitJsonPath(trimmedPattern));
}

function splitJsonPath(path: string): string[] {
  return path
    .replaceAll("[", ".")
    .replaceAll("]", "")
    .split(".")
    .filter((part) => part.length > 0);
}

function matchJsonPathSegments(key: string[], pattern: string[]): boolean {
  let keyIndex = 0;
  let patternIndex = 0;
  while (patternIndex < pattern.length) {
    if (pattern[patternIndex] === "**") {
      if (patternIndex === pattern.length - 1) {
        return true;
      }
      for (let next = keyIndex; next <= key.length; next += 1) {
        if (matchJsonPathSegments(key.slice(next), pattern.slice(patternIndex + 1))) {
          return true;
        }
      }
      return false;
    }
    if (keyIndex >= key.length) {
      return false;
    }
    if (pattern[patternIndex] !== "*" && pattern[patternIndex] !== key[keyIndex]) {
      return false;
    }
    keyIndex += 1;
    patternIndex += 1;
  }
  return keyIndex === key.length;
}

function fieldSet(names: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed) {
      out.add(trimmed);
      out.add(trimmed.toLowerCase());
    }
  }
  return out;
}

function hasField(name: string, set: ReadonlySet<string>): boolean {
  return set.has(name) || set.has(name.toLowerCase());
}

function positiveInt(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 100_000) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 100_000) {
      return parsed;
    }
  }
  return 0;
}

function looksLikeIcu(value: string): boolean {
  return ICU_ARGUMENT.test(value);
}

function looksLikeHtml(value: string): boolean {
  return HTML_TAG_HINT.test(value);
}

function applySubfilters(text: string, settings: JsonImportSettings): { format?: "html" | "icu" } {
  if (settings.icuSubfilter && looksLikeIcu(text)) {
    return { format: "icu" };
  }
  if (settings.htmlSubfilter && looksLikeHtml(text)) {
    return { format: "html" };
  }
  return {};
}

type CollectedJsonEntry = {
  text: string;
  context?: string;
  maxLength?: number;
  format?: "html" | "icu";
};

function siblingMetadata(
  value: Record<string, unknown>,
  contextFields: ReadonlySet<string>,
  limitFields: ReadonlySet<string>,
): { context: string; maxLength: number } {
  const parts: string[] = [];
  let maxLength = 0;
  for (const [key, field] of Object.entries(value)) {
    if (hasField(key, contextFields) && typeof field === "string" && field.trim()) {
      parts.push(field.trim());
      continue;
    }
    if (hasField(key, limitFields) && maxLength <= 0) {
      maxLength = positiveInt(field);
    }
  }
  return { context: parts.join("\n"), maxLength };
}

function flattenJson(
  out: Record<string, CollectedJsonEntry>,
  prefix: string,
  input: Record<string, unknown>,
  settings: JsonImportSettings,
): void {
  const contextFields = fieldSet(settings.contextFields);
  const limitFields = fieldSet(settings.characterLimitFields);
  const sibling = siblingMetadata(input, contextFields, limitFields);

  for (const [key, value] of Object.entries(input)) {
    if (hasField(key, contextFields) || hasField(key, limitFields)) {
      continue;
    }
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[nextKey] = {
        text: value,
        ...(sibling.context ? { context: sibling.context } : {}),
        ...(sibling.maxLength > 0 ? { maxLength: sibling.maxLength } : {}),
        ...applySubfilters(value, settings),
      };
      continue;
    }
    if (Array.isArray(value)) {
      flattenJsonArray(out, nextKey, value, settings);
      continue;
    }
    if (value && typeof value === "object") {
      flattenJson(out, nextKey, value as Record<string, unknown>, settings);
    }
  }
}

function flattenJsonArray(
  out: Record<string, CollectedJsonEntry>,
  prefix: string,
  input: unknown[],
  settings: JsonImportSettings,
): void {
  input.forEach((item, index) => {
    const itemKey = `${prefix}[${index}]`;
    if (typeof item === "string") {
      out[itemKey] = { text: item, ...applySubfilters(item, settings) };
      return;
    }
    if (Array.isArray(item)) {
      flattenJsonArray(out, itemKey, item, settings);
      return;
    }
    if (item && typeof item === "object") {
      flattenJson(out, itemKey, item as Record<string, unknown>, settings);
    }
  });
}

function isFormatJsCatalog(payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return false;
  }
  return keys.every((key) => {
    const value = payload[key];
    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { defaultMessage?: unknown }).defaultMessage === "string",
    );
  });
}

function extractJsonEntries(
  sourceText: string,
  settings: JsonImportSettings,
): Record<string, CollectedJsonEntry> {
  const parsed: unknown = JSON.parse(sourceText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const payload = parsed as Record<string, unknown>;
  const collected: Record<string, CollectedJsonEntry> = {};

  if (isFormatJsCatalog(payload)) {
    for (const [key, value] of Object.entries(payload)) {
      const message = value as { defaultMessage: string; description?: unknown };
      collected[key] = {
        text: message.defaultMessage,
        ...(typeof message.description === "string" && message.description.trim()
          ? { context: message.description.trim() }
          : {}),
        ...applySubfilters(message.defaultMessage, settings),
      };
    }
  } else {
    flattenJson(collected, "", payload, settings);
  }

  const includes = settings.keyPaths.map((path) => path.trim()).filter(Boolean);
  const excludes = settings.excludeKeyPaths.map((path) => path.trim()).filter(Boolean);
  const out: Record<string, CollectedJsonEntry> = {};
  for (const [key, entry] of Object.entries(collected)) {
    if (includes.length > 0 && !includes.some((pattern) => jsonKeyMatches(key, pattern))) {
      continue;
    }
    if (excludes.some((pattern) => jsonKeyMatches(key, pattern))) {
      continue;
    }
    out[key] = entry;
  }
  return out;
}

export function applyJsonIngestEntries(
  sourcePath: string,
  sourceText: string,
  payload: HlEntriesPayload,
  settings: JsonImportSettings,
): HlEntriesPayload {
  if (!isJsonTranslationSourcePath(sourcePath) || sourceText.trim().length === 0) {
    return payload;
  }

  let extracted: Record<string, CollectedJsonEntry>;
  try {
    extracted = extractJsonEntries(sourceText, settings);
  } catch {
    return payload;
  }
  if (Object.keys(extracted).length === 0) {
    return {};
  }

  const out: HlEntriesPayload = {};
  for (const [key, entry] of Object.entries(extracted)) {
    out[key] = {
      text: entry.text,
      ...(entry.context ? { context: entry.context } : {}),
      ...(entry.maxLength && entry.maxLength > 0 ? { maxLength: entry.maxLength } : {}),
      ...(entry.format ? { format: entry.format } : {}),
    };
  }
  return out;
}
