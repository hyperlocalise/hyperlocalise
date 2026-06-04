import type { ExternalTmsTranslationPusher } from "@/lib/providers/tms-provider-types";

import { SmartlingApiClient, SmartlingApiError } from "./smartling-api";
import { pollSmartlingJobProgress } from "./smartling-async-polling";
import { mapSmartlingFetcherError } from "./smartling-errors";

type LocaleUploadGroup = {
  locale: string;
  entries: Array<{
    hashcode: string;
    translation: string;
    stringText?: string | null;
    instruction?: string | null;
  }>;
};

export const pushSmartlingTranslations: ExternalTmsTranslationPusher = async ({
  credential,
  externalProjectId,
  externalJobId,
  secretMaterial,
  translations,
}) => {
  const client = new SmartlingApiClient({
    credentials: secretMaterial,
    authBaseUrl: credential.baseUrl ?? undefined,
  });

  const projectId = externalProjectId.trim();
  const jobUid = externalJobId.trim();
  if (!projectId || !jobUid) {
    throw new Error("invalid_smartling_project_or_job_id");
  }

  try {
    await client.getJob(projectId, jobUid);
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 401) {
      throw new Error("smartling_auth_invalid");
    }
    throw mapSmartlingFetcherError(error);
  }

  let uploaded = 0;
  let failed = 0;
  const failures: Array<{ locale: string; message: string; fileId?: string | null }> = [];
  const asyncOperations: Array<Record<string, unknown>> = [];

  const groups = new Map<string, LocaleUploadGroup>();
  for (const translation of translations) {
    const locale = translation.locale.trim();
    const hashcode = translation.externalStringId?.trim();
    if (!locale) {
      failed += 1;
      failures.push({
        locale: translation.locale,
        fileId: translation.fileId ?? null,
        message: "smartling_translation_missing_locale",
      });
      continue;
    }
    if (!hashcode) {
      failed += 1;
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "smartling_translation_missing_hashcode",
      });
      continue;
    }

    const text = translation.text.trim();
    if (!text) {
      failed += 1;
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "smartling_translation_missing_text",
      });
      continue;
    }

    const key = locale;
    const existing = groups.get(key) ?? { locale, entries: [] };
    existing.entries.push({
      hashcode,
      translation: text,
      stringText: translation.key ?? null,
    });
    groups.set(key, existing);
  }

  if (groups.size === 0) {
    return { uploaded, failed, failures, asyncOperations };
  }

  const localesToAuthorize = new Set<string>();
  for (const group of groups.values()) {
    try {
      await client.upsertLocaleTranslations(projectId, group.locale, group.entries);
      uploaded += group.entries.length;
      localesToAuthorize.add(group.locale);
      asyncOperations.push({
        type: "smartling_upsert_translations",
        locale: group.locale,
        count: group.entries.length,
        status: "succeeded",
      });
    } catch (error) {
      failed += group.entries.length;
      failures.push({
        locale: group.locale,
        fileId: null,
        message: error instanceof Error ? error.message : "smartling translation upload failed",
      });
      asyncOperations.push({
        type: "smartling_upsert_translations",
        locale: group.locale,
        status: "failed",
        error: error instanceof Error ? error.message : "smartling translation upload failed",
      });
    }
  }

  if (localesToAuthorize.size > 0) {
    try {
      const authorizeResult = await client.authorizeJob(projectId, jobUid, [...localesToAuthorize]);
      asyncOperations.push({
        type: "smartling_authorize_job",
        translationJobUid: jobUid,
        targetLocaleIds: [...localesToAuthorize],
        result: authorizeResult,
      });

      for (const locale of localesToAuthorize) {
        try {
          const progress = await pollSmartlingJobProgress({
            client,
            projectId,
            translationJobUid: jobUid,
            targetLocaleId: locale,
          });
          asyncOperations.push({
            type: "smartling_job_progress",
            translationJobUid: jobUid,
            locale,
            status: "succeeded",
            progress,
          });
        } catch (error) {
          asyncOperations.push({
            type: "smartling_job_progress",
            translationJobUid: jobUid,
            locale,
            status: "failed",
            error: error instanceof Error ? error.message : "smartling job progress polling failed",
          });
          failures.push({
            locale,
            fileId: null,
            message:
              error instanceof Error ? error.message : "smartling job progress polling failed",
          });
        }
      }
    } catch (error) {
      asyncOperations.push({
        type: "smartling_authorize_job",
        translationJobUid: jobUid,
        status: "failed",
        error: error instanceof Error ? error.message : "smartling job authorization failed",
      });
      for (const locale of localesToAuthorize) {
        failures.push({
          locale,
          fileId: null,
          message: error instanceof Error ? error.message : "smartling job authorization failed",
        });
      }
    }
  }

  return { uploaded, failed, failures, asyncOperations };
};
