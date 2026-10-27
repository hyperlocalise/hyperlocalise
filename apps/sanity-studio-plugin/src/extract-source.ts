import { normalizeSegmentText } from "./apply-translations";
import type { SanitySegment } from "./plugin-messages";

export type SanitySourcePullEntry = {
  key: string;
  source: string;
  knownTexts: string[];
};

export type SanitySourcePullPage = {
  locale: string;
  sourcePath: string;
  needsReupload: boolean;
  entries: SanitySourcePullEntry[];
};

type SanitySourceIndexEntry = {
  key: string;
  source: string;
};

export function buildSanitySourceTextIndex(
  entries: SanitySourcePullEntry[],
): Map<string, SanitySourceIndexEntry> {
  const index = new Map<string, SanitySourceIndexEntry>();
  const ambiguous = new Set<string>();

  for (const entry of entries) {
    const sourceNorm = normalizeSegmentText(entry.source);
    if (sourceNorm) {
      index.set(sourceNorm, { key: entry.key, source: entry.source });
    }
  }

  for (const entry of entries) {
    for (const text of entry.knownTexts) {
      const norm = normalizeSegmentText(text);
      if (!norm || ambiguous.has(norm)) {
        continue;
      }
      const existing = index.get(norm);
      if (existing && existing.key !== entry.key) {
        index.delete(norm);
        ambiguous.add(norm);
        continue;
      }
      if (!existing) {
        index.set(norm, { key: entry.key, source: entry.source });
      }
    }
  }

  return index;
}

function entriesByKey(entries: SanitySourcePullEntry[]): Map<string, SanitySourcePullEntry> {
  return new Map(entries.map((entry) => [entry.key, entry]));
}

/** Apply-only: restore stored source so canvas target text is not used as `sourceByKey`. */
export function remapExtractedSegmentsToSource(
  segments: SanitySegment[],
  pullPage: SanitySourcePullPage,
): SanitySegment[] {
  if (pullPage.needsReupload || pullPage.entries.length === 0) {
    return segments;
  }

  const byKey = entriesByKey(pullPage.entries);
  const textIndex = buildSanitySourceTextIndex(pullPage.entries);

  return segments.map((segment) => {
    const byStamp = byKey.get(segment.key);
    if (byStamp) {
      const canvasNorm = normalizeSegmentText(segment.text);
      const sourceNorm = normalizeSegmentText(byStamp.source);
      if (canvasNorm === sourceNorm) {
        return { ...segment, text: byStamp.source };
      }
      const matchesKnownTarget = byStamp.knownTexts.some(
        (text) => normalizeSegmentText(text) === canvasNorm,
      );
      if (matchesKnownTarget) {
        return { ...segment, text: byStamp.source };
      }
      return segment;
    }
    const norm = normalizeSegmentText(segment.text);
    const matched = norm ? textIndex.get(norm) : undefined;
    if (matched) {
      return { ...segment, text: matched.source };
    }
    return segment;
  });
}
