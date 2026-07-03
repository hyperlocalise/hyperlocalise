import { getLocaleLabel } from "@/lib/i18n/locales";

export function getProviderPayloadString(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getProviderPayloadNumber(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getProviderPayloadStringArray(
  payload: Record<string, unknown> | null,
  key: string,
): string[] {
  const value = payload?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function formatLocaleLabel(localeId: string) {
  return `${getLocaleLabel(localeId)} (${localeId})`;
}

export function formatLocaleList(localeIds: string[]) {
  if (localeIds.length === 0) {
    return "—";
  }

  return localeIds.map((localeId) => formatLocaleLabel(localeId)).join(", ");
}

export function getCrowdinTaskTypeLabel(payload: Record<string, unknown> | null) {
  switch (getProviderPayloadNumber(payload, "type")) {
    case 0:
      return "Translate by own translators";
    case 1:
      return "Proofread by own proofreaders";
    case 2:
      return "Translate by vendor";
    case 3:
      return "Proofread by vendor";
    default:
      return null;
  }
}

export function getCrowdinLanguageLabel(payload: Record<string, unknown> | null) {
  const languageId = getProviderPayloadString(payload, "languageId");
  if (languageId) {
    return formatLocaleLabel(languageId);
  }

  const targetLanguageId = getProviderPayloadString(payload, "targetLanguageId");
  if (targetLanguageId) {
    return formatLocaleLabel(targetLanguageId);
  }

  const targetLanguageIds = getProviderPayloadStringArray(payload, "targetLanguageIds");
  if (targetLanguageIds[0]) {
    return formatLocaleLabel(targetLanguageIds[0]);
  }

  const targetLanguages = payload?.targetLanguages;
  if (Array.isArray(targetLanguages)) {
    for (const targetLanguage of targetLanguages) {
      if (!targetLanguage || typeof targetLanguage !== "object" || Array.isArray(targetLanguage)) {
        continue;
      }

      const id = (targetLanguage as Record<string, unknown>).id;
      if (typeof id === "string" && id.trim().length > 0) {
        return formatLocaleLabel(id);
      }
    }
  }

  return null;
}

export function getCrowdinTargetLocales(
  payload: Record<string, unknown> | null,
  fallback: string[],
) {
  const fromPayload = getProviderPayloadStringArray(payload, "targetLanguageIds");
  if (fromPayload.length > 0) {
    return fromPayload;
  }

  if (fallback.length > 0) {
    return fallback;
  }

  const targetLanguageId = getProviderPayloadString(payload, "targetLanguageId");
  if (targetLanguageId) {
    return [targetLanguageId];
  }

  const languageId = getProviderPayloadString(payload, "languageId");
  return languageId ? [languageId] : [];
}

export function getCrowdinFileCount(payload: Record<string, unknown> | null) {
  const fileIds = payload?.fileIds;
  return Array.isArray(fileIds) ? fileIds.length : null;
}

export function getCrowdinLocaleReadiness(payload: Record<string, unknown> | null) {
  const readiness = payload?.localeReadiness;
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) return null;
  return readiness as Record<string, unknown>;
}

export function getCrowdinTaskLanguageId(payload: Record<string, unknown> | null) {
  return (
    getProviderPayloadString(payload, "languageId") ??
    getProviderPayloadString(payload, "targetLanguageId") ??
    getProviderPayloadStringArray(payload, "targetLanguageIds")[0] ??
    null
  );
}

function isLocaleReadinessEntry(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.translationProgress === "number" ||
    typeof record.approvalProgress === "number" ||
    (typeof record.words === "object" && record.words !== null && !Array.isArray(record.words))
  );
}

export function extractCrowdinLocaleReadinessEntry(
  localeReadiness: Record<string, unknown> | null | undefined,
  languageId: string | null,
): Record<string, unknown> | null {
  if (!localeReadiness) {
    return null;
  }

  if (isLocaleReadinessEntry(localeReadiness)) {
    return localeReadiness;
  }

  if (languageId && isLocaleReadinessEntry(localeReadiness[languageId])) {
    return localeReadiness[languageId] as Record<string, unknown>;
  }

  return null;
}

export function resolveCrowdinLocaleReadiness(
  payload: Record<string, unknown> | null,
  lazyReadinessByLanguage?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const languageId = getCrowdinTaskLanguageId(payload);
  const fromLazy = extractCrowdinLocaleReadinessEntry(lazyReadinessByLanguage ?? null, languageId);
  if (fromLazy) {
    return fromLazy;
  }

  return extractCrowdinLocaleReadinessEntry(getCrowdinLocaleReadiness(payload), languageId);
}

export function getReadinessNumber(readiness: Record<string, unknown> | null, key: string) {
  const value = readiness?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getReadinessWords(readiness: Record<string, unknown> | null) {
  const words = readiness?.words;
  if (!words || typeof words !== "object" || Array.isArray(words)) return null;
  return words as Record<string, unknown>;
}

export function formatReadinessProgress(readiness: Record<string, unknown> | null) {
  const translationProgress = getReadinessNumber(readiness, "translationProgress");
  const approvalProgress = getReadinessNumber(readiness, "approvalProgress");
  if (translationProgress === null && approvalProgress === null) return null;
  if (approvalProgress === null) return `${Math.round(translationProgress ?? 0)}% translated`;
  if (translationProgress === null) return `${Math.round(approvalProgress)}% approved`;
  return `${Math.round(translationProgress)}% translated · ${Math.round(approvalProgress)}% approved`;
}

export function formatWordsToDo(readiness: Record<string, unknown> | null) {
  const words = getReadinessWords(readiness);
  const total = getReadinessNumber(words, "total");
  const translated = getReadinessNumber(words, "translated");
  const approved = getReadinessNumber(words, "approved");
  if (total === null) return null;
  const completed = translated ?? approved ?? 0;
  const remaining = Math.max(total - completed, 0);
  return `${remaining} words left of ${total}`;
}
