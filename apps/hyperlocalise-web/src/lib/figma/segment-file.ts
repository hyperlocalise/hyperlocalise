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
import type { FigmaDesignSegment } from "./types";

import { slugifyFigmaName } from "./names";

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

export function buildFigmaPageFileName(input: { pageName?: string; pageId: string }): string {
  const pageSlug = slugifyFigmaName(input.pageName, "page");
  const idPart = sanitizeFigmaId(input.pageId);
  return `page-${pageSlug}-${idPart}.json`;
}

export function buildFigmaPageSourcePath(input: {
  fileName?: string;
  fileKey: string;
  pageName?: string;
  pageId: string;
}): string {
  const fileSlug = slugifyFigmaName(input.fileName, input.fileKey);
  const fileKeyPart = sanitizeFigmaPathSegment(input.fileKey);
  const pageFile = buildFigmaPageFileName({
    pageName: input.pageName,
    pageId: input.pageId,
  });
  return `figma/files/${fileSlug}-${fileKeyPart}/${pageFile}`;
}

/** Legacy path shape; kept for jobs created before per-page filenames. */
export function buildFigmaSourcePath(fileKey: string, pageId: string): string {
  return `figma/files/${sanitizeFigmaPathSegment(fileKey)}/pages/${sanitizeFigmaPathSegment(pageId)}.json`;
}
