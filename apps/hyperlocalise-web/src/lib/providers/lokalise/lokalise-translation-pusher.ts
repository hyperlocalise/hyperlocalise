import type { ExternalTmsTranslationPusher } from "@/lib/providers/external-tms-content-sync";

import {
  collectLokaliseTaskTargetLocales,
  LOKALISE_DEFAULT_BASE_URL,
  LokaliseApiClient,
  LokaliseApiError,
  parseLokaliseExternalJobId,
  summarizeLokaliseBulkUpdateChunkResult,
} from "./lokalise-api";
import { buildLokaliseTranslationWriteBackBatches } from "./lokalise-write-back";

const BULK_UPDATE_CHUNK_SIZE = 50;

export const pushLokaliseTranslations: ExternalTmsTranslationPusher = async ({
  credential,
  externalProjectId,
  externalJobId,
  secretMaterial,
  translations,
}) => {
  const projectId = externalProjectId.trim();
  if (!projectId) {
    throw new Error("invalid_lokalise_project_id");
  }

  const parsedJobId = parseLokaliseExternalJobId(externalJobId);
  if (!parsedJobId) {
    throw new Error("invalid_lokalise_job_id");
  }

  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
  });

  let defaultTargetLocale: string | null = null;
  let taskTargetLocales: string[] = [];
  try {
    const task = await client.getTask(projectId, parsedJobId.taskId);
    taskTargetLocales = collectLokaliseTaskTargetLocales(task);
    defaultTargetLocale = taskTargetLocales[0] ?? null;
  } catch (error) {
    throw mapLokaliseFetcherError(error);
  }

  const { batches, failures: payloadFailures } = buildLokaliseTranslationWriteBackBatches({
    translations,
    defaultTargetLocale,
    taskTargetLocales,
  });

  let uploaded = 0;
  let failed = payloadFailures.length;
  const failures = [...payloadFailures];
  const asyncOperations: Array<Record<string, unknown>> = [];

  for (let index = 0; index < batches.length; index += BULK_UPDATE_CHUNK_SIZE) {
    const chunk = batches.slice(index, index + BULK_UPDATE_CHUNK_SIZE);
    try {
      const response = await client.bulkUpdateKeys(projectId, chunk);
      const chunkResult = summarizeLokaliseBulkUpdateChunkResult(chunk, response);
      uploaded += chunkResult.uploaded;
      failed += chunkResult.failed;
      failures.push(...chunkResult.failures);

      asyncOperations.push({
        type: "lokalise_bulk_update_keys",
        keysRequested: chunk.length,
        keysUpdated: response.keys?.length ?? 0,
        keysFailed: chunkResult.failedKeyCount,
        status:
          chunkResult.failed > 0 ? (chunkResult.uploaded > 0 ? "partial" : "failed") : "succeeded",
      });
    } catch (error) {
      failed += chunk.reduce((count, batch) => count + batch.translations.length, 0);
      const message = error instanceof Error ? error.message : "lokalise_translation_upload_failed";
      for (const batch of chunk) {
        for (const translation of batch.translations) {
          failures.push({
            locale: translation.languageIso,
            fileId: null,
            message,
          });
        }
      }
      asyncOperations.push({
        type: "lokalise_bulk_update_keys",
        keysRequested: chunk.length,
        status: "failed",
        error: message,
      });
    }
  }

  return { uploaded, failed, failures, asyncOperations };
};

function mapLokaliseFetcherError(error: unknown) {
  if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
    return new Error("lokalise_auth_invalid");
  }

  return error instanceof Error ? error : new Error("lokalise_fetch_failed");
}
