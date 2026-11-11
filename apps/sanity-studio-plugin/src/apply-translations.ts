export function normalizeSegmentText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

const MIN_SOURCE_WORDS_FOR_SAME_AS_SOURCE = 2;

export function isMultiWordSameAsSource(sourceText: string, targetText: string): boolean {
  const source = sourceText.trim();
  const target = targetText.trim();
  if (!source || source !== target) {
    return false;
  }
  return source.split(/\s+/).length >= MIN_SOURCE_WORDS_FOR_SAME_AS_SOURCE;
}

export function buildApplySourceByKey(
  segments: ReadonlyArray<{ key: string; text: string }>,
): Record<string, string> {
  const sourceByKey: Record<string, string> = {};
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!segment.key || !text) {
      continue;
    }
    sourceByKey[segment.key] = segment.text;
  }
  return sourceByKey;
}

export type SanityApplyIndexEntry = {
  key: string;
  target: string;
};

export function buildSanityApplyTextIndex(input: {
  sourceByKey: Record<string, string>;
  translations: Record<string, string>;
}): Map<string, SanityApplyIndexEntry> {
  const index = new Map<string, SanityApplyIndexEntry>();
  const ambiguous = new Set<string>();

  for (const [key, source] of Object.entries(input.sourceByKey)) {
    const target = input.translations[key]?.trim();
    if (!target) {
      continue;
    }
    const sourceNorm = normalizeSegmentText(source);
    if (!sourceNorm || ambiguous.has(sourceNorm)) {
      continue;
    }
    const existing = index.get(sourceNorm);
    if (existing && existing.key !== key) {
      index.delete(sourceNorm);
      ambiguous.add(sourceNorm);
      continue;
    }
    if (!existing) {
      index.set(sourceNorm, { key, target });
    }
  }

  return index;
}

export function resolveSanityApplyTarget(input: {
  nodeText: string;
  stampedKey: string | null;
  translations: Record<string, string>;
  textIndex: Map<string, SanityApplyIndexEntry>;
  sourceByKey?: Record<string, string>;
}): string | null {
  if (input.stampedKey) {
    const source = input.sourceByKey?.[input.stampedKey] ?? "";
    const byKey = input.translations[input.stampedKey]?.trim();
    if (byKey && !isMultiWordSameAsSource(source, byKey)) {
      return byKey;
    }
    const sourceNorm = source ? normalizeSegmentText(source) : "";
    if (sourceNorm) {
      const viaSource = input.textIndex.get(sourceNorm)?.target;
      if (viaSource && !isMultiWordSameAsSource(source, viaSource)) {
        return viaSource;
      }
    }
    const storedSource = source.trim();
    return storedSource || byKey || null;
  }
  const norm = normalizeSegmentText(input.nodeText);
  if (!norm) {
    return null;
  }
  return input.textIndex.get(norm)?.target ?? null;
}
