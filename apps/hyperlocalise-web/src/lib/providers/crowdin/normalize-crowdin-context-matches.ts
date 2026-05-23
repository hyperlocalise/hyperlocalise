import type { StringTranslationContextSnapshot } from "@/lib/translation/assemble-translation-context";

export type CrowdinGlossaryConcordanceMatch = {
  glossary?: { id?: number; name?: string } | null;
  concept?: { id?: number } | null;
  sourceTerms?: Array<{
    id?: number;
    text?: string;
    description?: string;
    partOfSpeech?: string;
    status?: string;
    languageId?: string;
  }> | null;
  targetTerms?: Array<{
    id?: number;
    text?: string;
    description?: string;
    partOfSpeech?: string;
    status?: string;
    languageId?: string;
  }> | null;
};

export type CrowdinTmConcordanceMatch = {
  tm?: { id?: number; name?: string } | null;
  recordId?: number;
  source?: string;
  target?: string;
  relevant?: number;
  substituted?: string;
};

export function normalizeCrowdinGlossaryConcordanceMatches(
  matches: CrowdinGlossaryConcordanceMatch[] | null | undefined,
  input: { targetLocale: string; rankOffset?: number },
): StringTranslationContextSnapshot["glossaryTerms"] {
  if (!matches?.length) {
    return [];
  }

  const normalized: StringTranslationContextSnapshot["glossaryTerms"] = [];
  let index = input.rankOffset ?? 0;

  for (const match of matches) {
    if (!match) {
      continue;
    }

    const glossaryId = match.glossary?.id;
    const glossaryName = match.glossary?.name?.trim();
    if (glossaryId == null || !glossaryName) {
      continue;
    }

    const sourceTerm = pickPrimaryTermText(match.sourceTerms);
    if (!sourceTerm) {
      continue;
    }

    const targetTerm = pickTargetTermText(match.targetTerms, input.targetLocale);
    if (!targetTerm) {
      continue;
    }

    const sourceMeta = match.sourceTerms?.[0];
    const targetMeta =
      match.targetTerms?.find((term) => term.languageId === input.targetLocale) ??
      match.targetTerms?.[0];

    normalized.push({
      id: `crowdin:glossary:${glossaryId}:concept:${match.concept?.id ?? "unknown"}:target:${input.targetLocale}`,
      glossaryId: `crowdin:${glossaryId}`,
      glossaryName,
      sourceTerm,
      targetTerm,
      targetLocale: input.targetLocale,
      description: sourceMeta?.description?.trim() || targetMeta?.description?.trim() || null,
      forbidden: isForbiddenGlossaryStatus(targetMeta?.status ?? sourceMeta?.status),
      rank: Math.max(1, 100 - index),
    });
    index += 1;
  }

  return normalized;
}

export function normalizeCrowdinTranslationMemoryConcordanceMatches(
  matches: CrowdinTmConcordanceMatch[] | null | undefined,
  input: { targetLocale: string; rankOffset?: number },
): StringTranslationContextSnapshot["translationMemoryMatches"] {
  if (!matches?.length) {
    return [];
  }

  const normalized: StringTranslationContextSnapshot["translationMemoryMatches"] = [];
  let index = input.rankOffset ?? 0;

  for (const match of matches) {
    if (!match) {
      continue;
    }

    const sourceText = match.source?.trim();
    const targetText = (match.substituted?.trim() || match.target?.trim()) ?? "";
    if (!sourceText || !targetText) {
      continue;
    }

    const tmId = match.tm?.id;
    if (tmId == null) {
      continue;
    }

    const memoryId = `crowdin:${tmId}`;

    normalized.push({
      id: `crowdin:tm:${memoryId}:record:${match.recordId ?? index}`,
      memoryId,
      sourceText,
      targetText,
      targetLocale: input.targetLocale,
      provenance: "crowdin_concordance",
      matchScore: clampMatchScore(match.relevant),
      rank: Math.max(1, 100 - index),
    });
    index += 1;
  }

  return normalized;
}

export function mergeTranslationContextMatches<T extends { id: string; rank: number }>(
  primary: T[],
  supplemental: T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of [...primary, ...supplemental]) {
    if (seen.has(item.id) || merged.length >= limit) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }

  return merged.sort((left, right) => right.rank - left.rank);
}

function pickPrimaryTermText(terms: CrowdinGlossaryConcordanceMatch["sourceTerms"]): string | null {
  const text = terms?.map((term) => term.text?.trim()).find(Boolean);
  return text ?? null;
}

function pickTargetTermText(
  terms: CrowdinGlossaryConcordanceMatch["targetTerms"],
  targetLocale: string,
): string | null {
  const localized = terms
    ?.filter((term) => !term.languageId || term.languageId === targetLocale)
    .map((term) => term.text?.trim())
    .find(Boolean);

  if (localized) {
    return localized;
  }

  return terms?.map((term) => term.text?.trim()).find(Boolean) ?? null;
}

function isForbiddenGlossaryStatus(status: string | undefined): boolean | null {
  if (!status) {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  if (normalized === "not recommended" || normalized === "not_recommended") {
    return true;
  }

  return null;
}

function clampMatchScore(relevant: number | undefined): number {
  if (relevant == null || !Number.isFinite(relevant)) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(relevant)));
}
