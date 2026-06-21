import type { DesignSegment } from "./types";

const SEGMENT_KEY_PREFIX = "canva.segment.";

export function segmentKey(contentIndex: number, regionIndex: number): string {
  return `${SEGMENT_KEY_PREFIX}${contentIndex}.${regionIndex}`;
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
