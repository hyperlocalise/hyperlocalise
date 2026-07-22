/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { CanvaDesignSegment } from "./types";

const SEGMENT_KEY_PREFIX = "canva.segment.";

export function segmentKey(pageIndex: number, contentIndex: number, regionIndex: number): string {
  return `${SEGMENT_KEY_PREFIX}${pageIndex}.${contentIndex}.${regionIndex}`;
}

export function segmentsToTranslationFile(segments: CanvaDesignSegment[]): Record<string, string> {
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
    if (!key.startsWith(SEGMENT_KEY_PREFIX) || typeof value !== "string") {
      continue;
    }
    translations[key] = value;
  }

  return translations;
}

export function buildSourcePath(designId: string): string {
  return `canva/designs/${designId}.json`;
}
