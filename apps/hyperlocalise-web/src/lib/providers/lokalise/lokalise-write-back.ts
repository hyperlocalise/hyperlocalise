import type { ExternalTmsApprovedTranslationUpload } from "@/lib/providers/external-tms-content-sync";

import type { LokaliseBulkUpdateKey } from "./lokalise-api";

export type LokaliseTranslationWriteBackEntry = {
  keyId: number;
  keyName: string | null;
  locale: string;
  text: string;
};

export function buildLokaliseTranslationWriteBackBatches(input: {
  translations: ExternalTmsApprovedTranslationUpload[];
  defaultTargetLocale: string | null;
}): {
  batches: LokaliseBulkUpdateKey[];
  failures: Array<{ locale: string; message: string; fileId?: string | null }>;
} {
  const entriesByKeyId = new Map<number, LokaliseTranslationWriteBackEntry[]>();
  const failures: Array<{ locale: string; message: string; fileId?: string | null }> = [];

  for (const translation of input.translations) {
    const locale = translation.locale.trim() || input.defaultTargetLocale?.trim() || "";
    const text = translation.text.trim();
    const keyId = parseLokaliseKeyId(translation.externalStringId);
    const keyName = translation.key?.trim() || null;

    if (!locale) {
      failures.push({
        locale: translation.locale,
        fileId: translation.fileId ?? null,
        message: "lokalise_translation_missing_locale",
      });
      continue;
    }

    if (keyId == null) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "lokalise_translation_missing_key_id",
      });
      continue;
    }

    if (!text) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "lokalise_translation_missing_text",
      });
      continue;
    }

    const existing = entriesByKeyId.get(keyId) ?? [];
    existing.push({ keyId, keyName, locale, text });
    entriesByKeyId.set(keyId, existing);
  }

  const batches: LokaliseBulkUpdateKey[] = [];
  for (const entries of entriesByKeyId.values()) {
    batches.push({
      keyId: entries[0]!.keyId,
      translations: entries.map((entry) => ({
        languageIso: entry.locale,
        translation: entry.text,
        isUnverified: false,
        isReviewed: true,
      })),
    });
  }

  return { batches, failures };
}

function parseLokaliseKeyId(externalStringId: string | null | undefined) {
  const trimmed = externalStringId?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const keyId = Number(trimmed);
  if (!Number.isInteger(keyId) || keyId <= 0) {
    return null;
  }

  return keyId;
}
