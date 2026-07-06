import {
  extractCrowdinLocaleReadinessEntry,
  formatLocaleLabel,
  formatLocaleList,
  formatReadinessProgress,
  formatWordsToDo,
  getCrowdinLanguageLabel,
  getCrowdinTargetLocales,
  getCrowdinTaskLanguageId,
  getCrowdinTaskTypeLabel,
  getProviderPayloadString,
  getProviderPayloadStringArray,
  getReadinessNumber,
  getReadinessWords,
  resolveCrowdinLocaleReadiness,
} from "./provider-crowdin-job-display";

export {
  extractCrowdinLocaleReadinessEntry,
  formatLocaleLabel,
  formatLocaleList,
  formatReadinessProgress,
  formatWordsToDo,
  getProviderPayloadString,
  getReadinessNumber,
  getReadinessWords,
};

type ProviderPayload = Record<string, unknown> | null;

function readLanguageObjects(payload: ProviderPayload) {
  const languages = payload?.languages;
  if (!Array.isArray(languages)) {
    return [];
  }

  return languages.filter(
    (language): language is Record<string, unknown> =>
      Boolean(language) && typeof language === "object" && !Array.isArray(language),
  );
}

export function getLokaliseTaskTypeLabel(payload: ProviderPayload) {
  const taskType = getProviderPayloadString(payload, "taskType");
  if (!taskType) {
    return null;
  }

  switch (taskType) {
    case "translation":
      return "Translation";
    case "review":
      return "Review";
    default:
      return taskType.replaceAll("_", " ");
  }
}

export function getLokaliseTaskLanguageId(payload: ProviderPayload) {
  const languages = readLanguageObjects(payload);
  const firstLanguage = languages[0];
  const languageIso = firstLanguage?.languageIso;
  if (typeof languageIso === "string" && languageIso.trim()) {
    return languageIso.trim();
  }

  return getProviderPayloadStringArray(payload, "targetLanguageIds")[0] ?? null;
}

export function getLokaliseLanguageLabel(payload: ProviderPayload) {
  const languageId = getLokaliseTaskLanguageId(payload);
  if (languageId) {
    return formatLocaleLabel(languageId);
  }

  const languages = readLanguageObjects(payload);
  const languageName = languages[0]?.languageName;
  if (typeof languageName === "string" && languageName.trim()) {
    return languageName.trim();
  }

  return null;
}

export function getLokaliseTargetLocales(payload: ProviderPayload, fallback: string[]) {
  const languages = readLanguageObjects(payload)
    .map((language) => language.languageIso)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (languages.length > 0) {
    return languages;
  }

  if (fallback.length > 0) {
    return fallback;
  }

  const languageId = getLokaliseTaskLanguageId(payload);
  return languageId ? [languageId] : [];
}

export function resolveLokaliseLocaleReadiness(
  payload: ProviderPayload,
  lazyReadinessByLanguage?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const languageId = getLokaliseTaskLanguageId(payload);
  const fromLazy = extractCrowdinLocaleReadinessEntry(lazyReadinessByLanguage ?? null, languageId);
  if (fromLazy) {
    return fromLazy;
  }

  const languages = readLanguageObjects(payload);
  const matched = languageId
    ? languages.find(
        (language) =>
          typeof language.languageIso === "string" &&
          language.languageIso.trim() === languageId.trim(),
      )
    : languages[0];

  const progress =
    typeof matched?.progress === "number" && Number.isFinite(matched.progress)
      ? Math.round(matched.progress)
      : null;
  if (progress == null) {
    return null;
  }

  return {
    translationProgress: progress,
    approvalProgress: progress,
  };
}

export function resolveProviderTaskLanguageLabel(
  providerKind: string | null | undefined,
  payload: ProviderPayload,
) {
  if (providerKind === "crowdin") {
    return getCrowdinLanguageLabel(payload);
  }

  if (providerKind === "lokalise") {
    return getLokaliseLanguageLabel(payload);
  }

  return null;
}

export function resolveProviderTargetLocales(
  providerKind: string | null | undefined,
  payload: ProviderPayload,
  fallback: string[],
) {
  if (providerKind === "crowdin") {
    return getCrowdinTargetLocales(payload, fallback);
  }

  if (providerKind === "lokalise") {
    return getLokaliseTargetLocales(payload, fallback);
  }

  return fallback;
}

export function resolveProviderTaskTypeLabel(
  providerKind: string | null | undefined,
  payload: ProviderPayload,
  fallback: string,
) {
  if (providerKind === "crowdin") {
    return getCrowdinTaskTypeLabel(payload) ?? fallback;
  }

  if (providerKind === "lokalise") {
    return getLokaliseTaskTypeLabel(payload) ?? fallback;
  }

  return fallback;
}

export function resolveProviderTaskLanguageId(
  providerKind: string | null | undefined,
  payload: ProviderPayload,
) {
  if (providerKind === "crowdin") {
    return getCrowdinTaskLanguageId(payload);
  }

  if (providerKind === "lokalise") {
    return getLokaliseTaskLanguageId(payload);
  }

  return null;
}

export function resolveProviderLocaleReadiness(
  providerKind: string | null | undefined,
  payload: ProviderPayload,
  lazyReadinessByLanguage?: Record<string, unknown> | null,
) {
  if (providerKind === "crowdin") {
    return resolveCrowdinLocaleReadiness(payload, lazyReadinessByLanguage);
  }

  if (providerKind === "lokalise") {
    return resolveLokaliseLocaleReadiness(payload, lazyReadinessByLanguage);
  }

  return null;
}
