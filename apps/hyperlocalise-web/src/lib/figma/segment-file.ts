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

export const FIGMA_SEGMENT_KEY_PREFIX = "figma.segment.";

export function figmaSegmentKey(nodeId: string, regionIndex: number): string {
  return `${FIGMA_SEGMENT_KEY_PREFIX}${nodeId}.${regionIndex}`;
}

export function segmentsToTranslationFile(segments: FigmaDesignSegment[]): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const segment of segments) {
    if (segment.text.trim().length === 0) {
      continue;
    }
    entries[segment.key] = segment.text;
  }

  return entries;
}

export function parseTranslationFile(content: Record<string, unknown>): Record<string, string> {
  const translations: Record<string, string> = {};

  for (const [key, value] of Object.entries(content)) {
    if (!key.startsWith(FIGMA_SEGMENT_KEY_PREFIX) || typeof value !== "string") {
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

export function buildFigmaSourcePath(fileKey: string, pageId: string): string {
  return `figma/files/${sanitizeFigmaPathSegment(fileKey)}/pages/${sanitizeFigmaPathSegment(pageId)}.json`;
}
