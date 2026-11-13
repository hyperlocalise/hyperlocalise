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

/** Parse Figma/Canva integration JSON job outputs for plugin pull (hash aliases + stamp keys). */

import { createHash } from "node:crypto";

import {
  isSourceTextKey,
  parseTranslationFile as parseCanvaTranslationFile,
} from "@/lib/canva/segment-file";
import {
  isFigmaStampSegmentKey,
  parseTranslationFile as parseFigmaTranslationFile,
} from "@/lib/figma/segment-file";

function hashedSourceLockAliases(sourceText: string): string[] {
  const sha256 = createHash("sha256").update(sourceText, "utf8").digest("hex");
  const normalized = sourceText.normalize("NFKC").replace(/\s+/g, " ").trim();
  const nfkc = createHash("sha256").update(normalized, "utf8").digest("hex");
  return [
    sha256.slice(0, 16),
    sha256.slice(0, 32),
    nfkc.slice(0, 16),
    `json.${sha256.slice(0, 16)}`,
    `json.${nfkc.slice(0, 16)}`,
  ];
}

function applyHashedEntriesOntoSourceKeys(
  sourceEntries: Record<string, string>,
  extracted: Record<string, string>,
): Record<string, string> {
  const out = { ...extracted };
  for (const [key, source] of Object.entries(sourceEntries)) {
    if (out[key]?.trim() || !source?.trim()) {
      continue;
    }
    for (const alias of hashedSourceLockAliases(source.trim())) {
      const value = extracted[alias];
      if (value?.trim()) {
        out[key] = value;
        break;
      }
    }
  }
  return out;
}

function usesCanvaSourceTextKeys(sourceEntries: Record<string, string>): boolean {
  return Object.keys(sourceEntries).some(isSourceTextKey);
}

function usesFigmaStampSourceKeys(sourceEntries: Record<string, string>): boolean {
  return Object.keys(sourceEntries).some(isFigmaStampSegmentKey);
}

function parseIntegrationJsonTranslationFile(
  content: Record<string, unknown>,
  sourceEntries: Record<string, string>,
): Record<string, string> {
  if (usesFigmaStampSourceKeys(sourceEntries)) {
    return parseFigmaTranslationFile(content);
  }
  if (usesCanvaSourceTextKeys(sourceEntries)) {
    return parseCanvaTranslationFile(content);
  }
  return {};
}

function stringEntriesFromJsonObject(content: Record<string, unknown>): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(content)) {
    if (typeof value === "string") {
      entries[key] = value;
    }
  }
  return entries;
}

/** Stamp/canva keys from the file plus CLI hash keys mapped onto source keys. */
export function parseIntegrationJsonFileExtracted(
  content: Record<string, unknown>,
  sourceEntries: Record<string, string>,
): Record<string, string> {
  const stampParsed = parseIntegrationJsonTranslationFile(content, sourceEntries);
  return {
    ...applyHashedEntriesOntoSourceKeys(sourceEntries, stringEntriesFromJsonObject(content)),
    ...stampParsed,
  };
}
