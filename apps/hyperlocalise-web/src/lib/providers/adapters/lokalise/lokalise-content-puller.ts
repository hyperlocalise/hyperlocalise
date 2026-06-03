import type { ExternalTmsContentPuller } from "@/lib/providers/sync/external-tms-content-sync";

import {
  collectLokaliseTaskKeyIds,
  collectLokaliseTaskTargetLocales,
  extractLokaliseKeyName,
  inferFormatFromFilename,
  listLokaliseFilenameEntries,
  LOKALISE_DEFAULT_BASE_URL,
  LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
  LokaliseApiClient,
  LokaliseApiError,
  type LokaliseKey,
  parseLokaliseExternalJobId,
} from "./lokalise-api";
import { mapLokaliseTranslationReadiness } from "./lokalise-locale-readiness";

const KEY_ID_CHUNK_SIZE = 100;
const LOKALISE_EXPORT_ARTIFACT_METADATA_MAX_BYTES = 5 * 1024 * 1024;

export const pullLokaliseTaskContent: ExternalTmsContentPuller = async ({
  credential,
  externalProjectId,
  externalJobId,
  project,
  secretMaterial,
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

  let task;
  try {
    task = await client.getTask(projectId, parsedJobId.taskId);
  } catch (error) {
    throw mapLokaliseFetcherError(error);
  }

  const sourceLocale = task.sourceLanguageIso?.trim() || project.sourceLocale?.trim() || null;
  const targetLocales = collectLokaliseTaskTargetLocales(task);
  if (targetLocales.length === 0) {
    throw new Error("lokalise_task_missing_target_language");
  }

  const taskKeyIds = collectLokaliseTaskKeyIds(task);
  let keys: LokaliseKey[];
  try {
    keys =
      taskKeyIds.length > 0
        ? await listKeysByIds(client, projectId, taskKeyIds)
        : await client.listKeys(projectId, { includeTranslations: true });
  } catch (error) {
    throw mapLokaliseFetcherError(error);
  }

  const units: Awaited<ReturnType<ExternalTmsContentPuller>>["units"] = keys.map((key) => {
    const keyName = extractLokaliseKeyName(key.keyName);
    const translationsByLocale = new Map(
      key.translations.map((translation) => [translation.languageIso, translation]),
    );
    const sourceTranslation = sourceLocale ? translationsByLocale.get(sourceLocale) : null;
    const sourceText = sourceTranslation?.translation?.trim() || keyName;
    const primaryFilename = pickPrimaryFilename(key);

    const targetEntries = targetLocales.flatMap((locale) => {
      const translation = translationsByLocale.get(locale);
      if (!translation?.translation?.trim()) {
        return [];
      }

      const readiness = mapLokaliseTranslationReadiness({
        content: translation.translation,
        isUnverified: translation.isUnverified,
        isReviewed: translation.isReviewed,
        isArchived: key.isArchived,
        isHidden: key.isHidden,
      });

      return [
        {
          locale,
          text: translation.translation.trim(),
          externalTranslationId: String(translation.translationId),
          isApproved: readiness === "ready",
        },
      ];
    });

    return {
      externalStringId: String(key.keyId),
      key: keyName,
      sourceText,
      context: key.context ?? key.description,
      fileId: primaryFilename,
      translations: targetEntries,
      providerPayload: {
        tags: key.tags,
        platforms: key.platforms,
        filenames: buildNonEmptyFilenamesPayload(key.filenames),
        isPlural: key.isPlural,
        isHidden: key.isHidden,
        isArchived: key.isArchived,
      },
    };
  });

  let exportArtifact: Awaited<ReturnType<ExternalTmsContentPuller>>["exportArtifact"] = null;
  try {
    const format = inferPrimaryFormat(keys) ?? "json";
    const download = await client.requestFileDownload(projectId, {
      format,
      originalFilenames: false,
      bundleStructure: LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
      filterLangs: [...new Set([...(sourceLocale ? [sourceLocale] : []), ...targetLocales])],
    });
    const byteLength = await client.getDownloadByteLength(
      download.bundleUrl,
      LOKALISE_EXPORT_ARTIFACT_METADATA_MAX_BYTES,
    );
    exportArtifact = {
      url: download.bundleUrl,
      format,
      byteLength,
    };
  } catch {
    // File export is best-effort for agent workflows.
  }

  return {
    externalJobId,
    externalTaskId: String(task.taskId),
    sourceLocale,
    targetLocales,
    units,
    exportArtifact,
    providerPayload: {
      taskId: task.taskId,
      status: task.status,
      title: task.title,
      taskType: task.taskType,
      keysCount: task.keysCount,
      wordsCount: task.wordsCount,
      keyIds: taskKeyIds,
    },
  };
};

async function listKeysByIds(client: LokaliseApiClient, projectId: string, keyIds: number[]) {
  const keysById = new Map<number, LokaliseKey>();
  for (let index = 0; index < keyIds.length; index += KEY_ID_CHUNK_SIZE) {
    const chunk = keyIds.slice(index, index + KEY_ID_CHUNK_SIZE);
    const page = await client.listKeys(projectId, {
      includeTranslations: true,
      filterKeyIds: chunk,
    });
    for (const key of page) {
      keysById.set(key.keyId, key);
    }
  }

  return [...keysById.values()];
}

function pickPrimaryFilename(key: LokaliseKey) {
  for (const platform of key.platforms) {
    const normalizedPlatform = platform.trim().toLowerCase();
    if (normalizedPlatform === "web" && key.filenames.web.trim()) {
      return key.filenames.web;
    }
    if (normalizedPlatform === "ios" && key.filenames.ios.trim()) {
      return key.filenames.ios;
    }
    if (normalizedPlatform === "android" && key.filenames.android.trim()) {
      return key.filenames.android;
    }
    if (normalizedPlatform === "other" && key.filenames.other.trim()) {
      return key.filenames.other;
    }
  }

  return listLokaliseFilenameEntries(key.filenames)[0]?.filename ?? null;
}

function buildNonEmptyFilenamesPayload(filenames: LokaliseKey["filenames"]) {
  return Object.fromEntries(
    listLokaliseFilenameEntries(filenames).map((entry) => [entry.platform, entry.filename]),
  );
}

function inferPrimaryFormat(keys: LokaliseKey[]) {
  for (const key of keys) {
    const filename = pickPrimaryFilename(key);
    if (!filename) {
      continue;
    }

    const format = inferFormatFromFilename(filename);
    if (format) {
      return format;
    }
  }

  return null;
}

function mapLokaliseFetcherError(error: unknown) {
  if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
    return new Error("lokalise_auth_invalid");
  }

  return error instanceof Error ? error : new Error("lokalise_fetch_failed");
}
