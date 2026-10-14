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
import { slugifyFigmaName } from "./names";
import type { FigmaDesignSegment } from "./types";

export const FIGMA_SEGMENT_KEY_PREFIX = "figma.k.";
export const FIGMA_LEGACY_SEGMENT_KEY_PREFIX = "figma.segment.";

export function isFigmaStampSegmentKey(key: string): boolean {
  return key.startsWith(FIGMA_SEGMENT_KEY_PREFIX);
}

export function isLegacyFigmaSegmentKey(key: string): boolean {
  return key.startsWith(FIGMA_LEGACY_SEGMENT_KEY_PREFIX);
}

export function figmaSourceFileNeedsReupload(sourceFile: Record<string, unknown>): boolean {
  for (const key of Object.keys(sourceFile)) {
    if (isLegacyFigmaSegmentKey(key)) {
      return true;
    }
  }
  return false;
}

export function segmentsToTranslationFile(segments: FigmaDesignSegment[]): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const segment of segments) {
    if (segment.text.trim().length === 0) {
      continue;
    }
    if (!isFigmaStampSegmentKey(segment.key)) {
      continue;
    }
    entries[segment.key] = segment.text;
  }

  return entries;
}

export function parseTranslationFile(content: Record<string, unknown>): Record<string, string> {
  const translations: Record<string, string> = {};

  for (const [key, value] of Object.entries(content)) {
    if (!isFigmaStampSegmentKey(key) || typeof value !== "string") {
      continue;
    }
    translations[key] = value;
  }

  return translations;
}

function sanitizeFigmaPathSegment(value: string): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9:_-]+/g, "_")
    .replace(/^[_-]+/, "")
    .replace(/[_-]+$/, "");
  return sanitized.slice(0, 128) || "unknown";
}

/** Filesystem-safe Figma node id (`12:34` → `12-34`). */
export function sanitizeFigmaId(pageId: string): string {
  return (
    pageId
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 128) || "page"
  );
}

const FIGMA_PAGE_SLUG_MAX_LENGTH = 48;

export function buildFigmaPageFileName(input: { pageId: string; pageName?: string }): string {
  const pageSlug =
    slugifyFigmaName(input.pageName, "page")
      .slice(0, FIGMA_PAGE_SLUG_MAX_LENGTH)
      .replace(/-+$/, "") || "page";
  return `${pageSlug}-${sanitizeFigmaId(input.pageId)}.json`;
}

export function buildFigmaPageSourcePath(input: {
  fileKey: string;
  pageId: string;
  fileName?: string;
  pageName?: string;
}): string {
  return `figma/files/${sanitizeFigmaPathSegment(input.fileKey)}/${buildFigmaPageFileName({
    pageName: input.pageName,
    pageId: input.pageId,
  })}`;
}

export function buildFigmaSourcePath(fileKey: string, pageId: string, pageName?: string): string {
  return buildFigmaPageSourcePath({ fileKey, pageId, pageName });
}

/** Include every stamp key that shares source text with a lock-completed key. */
export function expandFigmaLockKeysBySharedSource(
  keys: readonly string[],
  sourceEntries: Record<string, string>,
): string[] {
  const expanded = new Set(keys);
  const completedSources = new Set<string>();
  for (const key of keys) {
    if (!isFigmaStampSegmentKey(key)) {
      continue;
    }
    const source = sourceEntries[key]?.trim();
    if (source) {
      completedSources.add(source);
    }
  }
  if (completedSources.size === 0) {
    return [...expanded];
  }
  for (const [key, source] of Object.entries(sourceEntries)) {
    if (!isFigmaStampSegmentKey(key)) {
      continue;
    }
    const normalized = source.trim();
    if (normalized && completedSources.has(normalized)) {
      expanded.add(key);
    }
  }
  return [...expanded];
}

/** When duplicate text nodes share source copy, one translated stamp key applies to the rest. */
export function propagateFigmaTranslationsBySharedSource(
  sourceByKey: Record<string, string>,
  translations: Record<string, string>,
): Record<string, string> {
  const bestTranslationBySource = new Map<string, string>();
  for (const [key, translation] of Object.entries(translations)) {
    if (!isFigmaStampSegmentKey(key)) {
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
    if (!isFigmaStampSegmentKey(key)) {
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
