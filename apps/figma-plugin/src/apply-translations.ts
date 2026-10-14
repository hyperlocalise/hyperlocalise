export function normalizeSegmentText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export type FigmaApplyIndexEntry = {
  key: string;
  target: string;
};

export function buildFigmaApplyTextIndex(input: {
  sourceByKey: Record<string, string>;
  translations: Record<string, string>;
}): Map<string, FigmaApplyIndexEntry> {
  const index = new Map<string, FigmaApplyIndexEntry>();
  const ambiguous = new Set<string>();

  for (const [key, source] of Object.entries(input.sourceByKey)) {
    const target = input.translations[key]?.trim();
    if (!target) {
      continue;
    }
    const sourceNorm = normalizeSegmentText(source);
    if (sourceNorm) {
      index.set(sourceNorm, { key, target });
    }
  }

  for (const [key, targetRaw] of Object.entries(input.translations)) {
    const target = targetRaw.trim();
    if (!target) {
      continue;
    }
    const extras = [target];
    const source = input.sourceByKey[key];
    if (source) {
      extras.push(source);
    }
    for (const text of extras) {
      const norm = normalizeSegmentText(text);
      if (!norm || ambiguous.has(norm)) {
        continue;
      }
      const existing = index.get(norm);
      if (existing && existing.key !== key) {
        index.delete(norm);
        ambiguous.add(norm);
        continue;
      }
      if (!existing) {
        index.set(norm, { key, target });
      }
    }
  }

  return index;
}

export function resolveFigmaApplyTarget(input: {
  nodeText: string;
  stampedKey: string | null;
  translations: Record<string, string>;
  textIndex: Map<string, FigmaApplyIndexEntry>;
}): string | null {
  if (input.stampedKey) {
    const byKey = input.translations[input.stampedKey]?.trim();
    if (byKey) {
      return byKey;
    }
  }
  const norm = normalizeSegmentText(input.nodeText);
  if (!norm) {
    return null;
  }
  return input.textIndex.get(norm)?.target ?? null;
}
