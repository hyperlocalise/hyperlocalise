import type { LokaliseGlossaryTerm, LokaliseKey, LokaliseTranslation } from "./lokalise-api";

export const LOKALISE_PROJECT_GLOSSARY_EXTERNAL_ID_SUFFIX = ":glossary";
export const LOKALISE_PROJECT_TM_EXTERNAL_ID_SUFFIX = ":translation-memory";

export function buildLokaliseProjectGlossaryExternalId(projectId: string) {
  return `${projectId.trim()}${LOKALISE_PROJECT_GLOSSARY_EXTERNAL_ID_SUFFIX}`;
}

export function buildLokaliseProjectTranslationMemoryExternalId(projectId: string) {
  return `${projectId.trim()}${LOKALISE_PROJECT_TM_EXTERNAL_ID_SUFFIX}`;
}

export function scoreLokaliseTextMatch(sourceText: string, candidateText: string) {
  const source = sourceText.trim();
  const candidate = candidateText.trim();
  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 100;
  }

  const sourceLower = source.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  if (sourceLower === candidateLower) {
    return 98;
  }

  if (candidateLower.includes(sourceLower) || sourceLower.includes(candidateLower)) {
    const ratio =
      Math.min(source.length, candidate.length) / Math.max(source.length, candidate.length);
    return Math.round(70 + ratio * 25);
  }

  const sourceTokens = tokenizeLokaliseText(sourceLower);
  const candidateTokens = tokenizeLokaliseText(candidateLower);
  if (sourceTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const overlap = sourceTokens.filter((token) => candidateTokens.includes(token)).length;
  if (overlap === 0) {
    return 0;
  }

  const coverage = overlap / Math.max(sourceTokens.length, candidateTokens.length);
  return Math.round(50 + coverage * 40);
}

export function matchesLokaliseGlossaryTerm(
  sourceText: string,
  term: Pick<LokaliseGlossaryTerm, "term" | "caseSensitive">,
) {
  const score = scoreLokaliseTextMatch(sourceText, term.term);
  if (score < 55) {
    return false;
  }

  if (!term.caseSensitive) {
    return true;
  }

  return sourceText.trim() === term.term.trim();
}

export function pickLokaliseGlossaryTranslation(
  term: LokaliseGlossaryTerm,
  targetLocale: string,
  languageIsoById: Map<number, string>,
) {
  const normalizedTarget = targetLocale.trim().toLowerCase();
  for (const translation of term.translations) {
    const locale = resolveLokaliseGlossaryTranslationLocale(translation, languageIsoById);
    if (!locale || locale.toLowerCase() !== normalizedTarget) {
      continue;
    }

    const targetTerm = translation.translation.trim();
    if (targetTerm) {
      return targetTerm;
    }
  }

  return null;
}

export function resolveLokaliseGlossaryTranslationLocale(
  translation: LokaliseGlossaryTerm["translations"][number],
  languageIsoById: Map<number, string>,
) {
  const direct =
    translation.languageIso?.trim() ||
    translation.langIso?.trim() ||
    translation.languageIsoSnake?.trim() ||
    translation.langIsoSnake?.trim();
  if (direct) {
    return direct;
  }

  const languageId = translation.languageId || translation.languageIdSnake;
  if (languageId != null && languageId > 0) {
    return languageIsoById.get(languageId) ?? null;
  }

  return null;
}

export function pickLokaliseKeyTranslation(
  key: LokaliseKey,
  locale: string,
): LokaliseTranslation | null {
  const normalizedLocale = locale.trim().toLowerCase();
  return (
    key.translations.find(
      (translation) => translation.languageIso.trim().toLowerCase() === normalizedLocale,
    ) ?? null
  );
}

export function buildLokaliseTranslationMemorySegmentCandidates(
  keys: LokaliseKey[],
  input: {
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    limit: number;
  },
) {
  const scored: Array<{
    keyId: number;
    sourceText: string;
    targetText: string;
    matchScore: number;
  }> = [];

  for (const key of keys) {
    const sourceTranslation = pickLokaliseKeyTranslation(key, input.sourceLocale);
    const targetTranslation = pickLokaliseKeyTranslation(key, input.targetLocale);
    if (!sourceTranslation || !targetTranslation) {
      continue;
    }

    const sourceSegment = sourceTranslation.translation.trim();
    const targetSegment = targetTranslation.translation.trim();
    if (!sourceSegment || !targetSegment) {
      continue;
    }

    const matchScore = scoreLokaliseTextMatch(input.sourceText, sourceSegment);
    if (matchScore < 55) {
      continue;
    }

    scored.push({
      keyId: key.keyId,
      sourceText: sourceSegment,
      targetText: targetSegment,
      matchScore,
    });
  }

  return scored.toSorted((left, right) => right.matchScore - left.matchScore).slice(0, input.limit);
}

function tokenizeLokaliseText(value: string) {
  return value
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}
