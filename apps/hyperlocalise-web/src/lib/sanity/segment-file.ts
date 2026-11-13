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
import type { SanityDocumentSegment } from "./types";

export const SANITY_SEGMENT_KEY_PREFIX = "sanity.k.";
const SANITY_SEGMENT_KEY_PATTERN = /^sanity\.k\.[A-Za-z0-9._-]+$/;
const SANITY_SOURCE_PATH_MAX = 2048;

export function isSanityStampSegmentKey(key: string): boolean {
  return key.startsWith(SANITY_SEGMENT_KEY_PREFIX);
}

export function normalizeSanitySegmentText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function segmentsToTranslationFile(
  segments: SanityDocumentSegment[],
): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const segment of segments) {
    const normalized = normalizeSanitySegmentText(segment.text);
    if (normalized.length === 0) {
      continue;
    }
    if (!SANITY_SEGMENT_KEY_PATTERN.test(segment.key)) {
      continue;
    }
    entries[segment.key] = normalized;
  }

  return entries;
}

export function parseSanityTranslationFile(
  content: Record<string, unknown>,
): Record<string, string> {
  const translations: Record<string, string> = {};

  for (const [key, value] of Object.entries(content)) {
    if (!SANITY_SEGMENT_KEY_PATTERN.test(key) || typeof value !== "string") {
      continue;
    }
    translations[key] = value;
  }

  return translations;
}

function sanitizePathSegment(value: string, fallback: string, maxLength = 128): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return sanitized || fallback;
}

export function sanitizeSanityPublishedId(documentId: string): string {
  const withoutDrafts = documentId.replace(/^drafts\./, "");
  return sanitizePathSegment(withoutDrafts.replace(/\./g, "-"), "document");
}

function slugifyDocumentTitle(title: string | undefined): string {
  const slug = (title ?? "document")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "document";
}

export function buildSanityDocumentFileName(input: {
  documentId: string;
  documentTitle?: string;
}): string {
  const titleSlug = slugifyDocumentTitle(input.documentTitle);
  return `${titleSlug}-${sanitizeSanityPublishedId(input.documentId)}.json`;
}

/** Repository paths for Studio plugin uploads (OAuth editor view / bulk tool). */
export const SANITY_PLUGIN_SOURCE_PATH_PREFIX = "sanity-plugin";

export function isSanityPluginSourcePath(sourcePath: string): boolean {
  return sourcePath.startsWith(`${SANITY_PLUGIN_SOURCE_PATH_PREFIX}/`);
}

export function isSanityCatSourcePath(sourcePath: string): boolean {
  return (
    isSanityPluginSourcePath(sourcePath) ||
    (sourcePath.startsWith("sanity/") && sourcePath.endsWith(".json"))
  );
}

export function buildSanityDocumentSourcePath(input: {
  sanityProjectId: string;
  dataset: string;
  documentType: string;
  documentId: string;
  documentTitle?: string;
}): string {
  const path = `${SANITY_PLUGIN_SOURCE_PATH_PREFIX}/${sanitizePathSegment(input.sanityProjectId, "unknown")}/${sanitizePathSegment(input.dataset, "production")}/${sanitizePathSegment(input.documentType, "document")}/${buildSanityDocumentFileName(
    {
      documentId: input.documentId,
      documentTitle: input.documentTitle,
    },
  )}`;
  if (path.length > SANITY_SOURCE_PATH_MAX) {
    throw new Error("sanity_source_path_too_long");
  }
  return path;
}

export function propagateSanityTranslationsBySharedSource(
  sourceByKey: Record<string, string>,
  translations: Record<string, string>,
): Record<string, string> {
  const bestTranslationBySource = new Map<string, string>();
  for (const [key, translation] of Object.entries(translations)) {
    if (!isSanityStampSegmentKey(key)) {
      continue;
    }
    const source = sourceByKey[key]?.trim() ?? "";
    const value = translation.trim();
    if (!source || !value || value === source) {
      continue;
    }
    if (!bestTranslationBySource.has(source)) {
      bestTranslationBySource.set(source, translation);
    }
  }

  const output = { ...translations };
  for (const [key, source] of Object.entries(sourceByKey)) {
    if (!isSanityStampSegmentKey(key)) {
      continue;
    }
    const normalizedSource = source.trim();
    if (!normalizedSource) {
      continue;
    }
    const best = bestTranslationBySource.get(normalizedSource);
    if (!best) {
      continue;
    }
    const current = output[key]?.trim() ?? "";
    if (!current || current === normalizedSource) {
      output[key] = best;
    }
  }
  return output;
}
