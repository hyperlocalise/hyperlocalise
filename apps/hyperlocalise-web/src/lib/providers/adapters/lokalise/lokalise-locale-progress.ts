import { LokaliseApiClient, LokaliseApiError, type LokaliseKey } from "./lokalise-api";
import { mapLokaliseTranslationReadiness } from "./lokalise-locale-readiness";
import { pickLokaliseKeyTranslation } from "./normalize-lokalise-context-matches";

type LocaleProgressCounts = {
  total: number;
  translated: number;
  approved: number;
};

function isCountableKey(key: LokaliseKey) {
  return !key.isArchived && !key.isHidden;
}

function countTranslationState(keys: LokaliseKey[], locale: string): LocaleProgressCounts {
  let total = 0;
  let translated = 0;
  let approved = 0;

  for (const key of keys) {
    if (!isCountableKey(key)) {
      continue;
    }

    total += 1;
    const translation = pickLokaliseKeyTranslation(key, locale);
    const readiness = mapLokaliseTranslationReadiness({
      content: translation?.translation,
      isUnverified: translation?.isUnverified,
      isReviewed: translation?.isReviewed,
      isArchived: key.isArchived,
      isHidden: key.isHidden,
    });

    if (readiness === "missing" || readiness === "excluded") {
      continue;
    }

    translated += 1;
    if (readiness === "ready") {
      approved += 1;
    }
  }

  return { total, translated, approved };
}

function toProgressPercent(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((completed / total) * 100);
}

export function mapLokaliseLocaleProgressToReadiness(input: {
  locale: string;
  counts: LocaleProgressCounts;
}): Record<string, unknown> {
  const phrases = {
    total: input.counts.total,
    translated: input.counts.translated,
    approved: input.counts.approved,
  };

  return {
    translationProgress: toProgressPercent(input.counts.translated, input.counts.total),
    approvalProgress: toProgressPercent(input.counts.approved, input.counts.total),
    words: phrases,
    phrases,
  };
}

export async function loadLokaliseProjectLocaleReadiness(input: {
  client: LokaliseApiClient;
  projectId: string;
  languageId?: string;
}): Promise<Record<string, unknown>> {
  let keys: LokaliseKey[];
  let languages: Awaited<ReturnType<LokaliseApiClient["listProjectLanguages"]>>;
  try {
    [keys, languages] = await Promise.all([
      input.client.listKeys(input.projectId, { includeTranslations: true }),
      input.client.listProjectLanguages(input.projectId),
    ]);
  } catch (error) {
    if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
      throw new Error("lokalise_auth_invalid");
    }
    throw error;
  }

  const targetLocales = languages
    .map((language) => language.langIso.trim())
    .filter((locale) => locale.length > 0);
  const locales = input.languageId?.trim()
    ? targetLocales.filter((locale) => locale === input.languageId?.trim())
    : targetLocales;

  const localeReadiness: Record<string, unknown> = {};
  for (const locale of locales) {
    const counts = countTranslationState(keys, locale);
    localeReadiness[locale] = mapLokaliseLocaleProgressToReadiness({ locale, counts });
  }

  if (input.languageId?.trim() && localeReadiness[input.languageId.trim()]) {
    return localeReadiness[input.languageId.trim()] as Record<string, unknown>;
  }

  return localeReadiness;
}

export function mapLokaliseTaskLanguageProgressToReadiness(input: {
  languageIso: string;
  progress: number;
}): Record<string, unknown> {
  const rounded = Math.max(0, Math.min(100, Math.round(input.progress)));
  return {
    translationProgress: rounded,
    approvalProgress: rounded,
  };
}
