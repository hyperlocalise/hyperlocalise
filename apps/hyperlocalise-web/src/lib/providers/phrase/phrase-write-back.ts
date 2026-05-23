import type { ExternalTmsApprovedTranslationUpload } from "@/lib/providers/external-tms-content-sync";

export type PhraseTranslationWriteBackEntry = {
  key: string;
  keyId: string | null;
  locale: string;
  text: string;
  branch: string | null;
  jobTag: string | null;
};

export type PhraseTranslationWriteBackGroup = {
  locale: string;
  branch: string | null;
  jobTag: string | null;
  entries: PhraseTranslationWriteBackEntry[];
};

export function buildPhraseTranslationWriteBackGroups(input: {
  translations: ExternalTmsApprovedTranslationUpload[];
  branch: string | null;
  jobTag: string | null;
  defaultTargetLocale: string | null;
}): {
  groups: PhraseTranslationWriteBackGroup[];
  failures: Array<{ locale: string; message: string; fileId?: string | null }>;
} {
  const groups = new Map<string, PhraseTranslationWriteBackGroup>();
  const failures: Array<{ locale: string; message: string; fileId?: string | null }> = [];

  for (const translation of input.translations) {
    const locale = translation.locale.trim() || input.defaultTargetLocale?.trim() || "";
    const key = translation.key?.trim() || translation.externalStringId?.trim() || "";
    const text = translation.text.trim();

    if (!locale) {
      failures.push({
        locale: translation.locale,
        fileId: translation.fileId ?? null,
        message: "phrase_translation_missing_locale",
      });
      continue;
    }

    if (!key) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "phrase_translation_missing_key",
      });
      continue;
    }

    if (!text) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "phrase_translation_missing_text",
      });
      continue;
    }

    const groupKey = `${locale}::${input.branch ?? ""}`;
    const existing = groups.get(groupKey) ?? {
      locale,
      branch: input.branch,
      jobTag: input.jobTag,
      entries: [],
    };

    existing.entries.push({
      key,
      keyId: translation.externalStringId?.trim() || null,
      locale,
      text,
      branch: input.branch,
      jobTag: input.jobTag,
    });
    groups.set(groupKey, existing);
  }

  return {
    groups: [...groups.values()],
    failures,
  };
}
