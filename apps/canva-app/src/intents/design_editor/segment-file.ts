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
import type { DesignSegment } from "./types";

const SEGMENT_KEY_PREFIX = "canva.segment.";

export function segmentKey(pageIndex: number, contentIndex: number, regionIndex: number): string {
  return `${SEGMENT_KEY_PREFIX}${pageIndex}.${contentIndex}.${regionIndex}`;
}

export function pageSegmentKey(contentIndex: number, regionIndex: number): string {
  return `${SEGMENT_KEY_PREFIX}${contentIndex}.${regionIndex}`;
}

function usableTranslation(value: string | undefined): string | undefined {
  if (value == null || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

export function lookupTranslatedText(
  translations: Record<string, string>,
  contentIndex: number,
  regionIndex: number,
): string | undefined {
  const pageLocal = usableTranslation(translations[pageSegmentKey(contentIndex, regionIndex)]);
  if (pageLocal != null) {
    return pageLocal;
  }

  const suffix = `.${contentIndex}.${regionIndex}`;
  for (const [key, value] of Object.entries(translations)) {
    if (!key.startsWith(SEGMENT_KEY_PREFIX) || !key.endsWith(suffix)) {
      continue;
    }
    const match = usableTranslation(value);
    if (match != null) {
      return match;
    }
  }

  return undefined;
}

export function segmentsToTranslationFile(segments: DesignSegment[]): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const segment of segments) {
    if (segment.text.trim().length === 0) {
      continue;
    }
    entries[segment.key] = segment.text;
  }

  return entries;
}

function flattenSegmentEntries(
  output: Record<string, string>,
  prefix: string,
  value: unknown,
): void {
  if (typeof value === "string") {
    if (prefix.startsWith(SEGMENT_KEY_PREFIX)) {
      output[prefix] = value;
    }
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    flattenSegmentEntries(output, prefix ? `${prefix}.${key}` : key, nested);
  }
}

export function parseTranslationFile(content: Record<string, unknown>): Record<string, string> {
  const translations: Record<string, string> = {};
  const leaves: Record<string, unknown> = {};
  const nested: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(content)) {
    if (typeof value === "string") {
      leaves[key] = value;
    } else {
      nested[key] = value;
    }
  }

  flattenSegmentEntries(translations, "", leaves);
  flattenSegmentEntries(translations, "", nested);
  return translations;
}

export function buildSourcePath(designId: string): string {
  return `canva/designs/${designId}.json`;
}

export function pageFileNumber(pageIndex: number): number {
  return pageIndex + 1;
}

export function buildPageFileName(pageIndex: number): string {
  return `page-${pageFileNumber(pageIndex)}.json`;
}

function canvaPathSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export function buildPageSourcePath(
  designSlug: string,
  designId: string,
  pageIndex: number,
): string {
  return `canva/designs/${designSlug}-${canvaPathSegment(designId)}/${buildPageFileName(pageIndex)}`;
}
