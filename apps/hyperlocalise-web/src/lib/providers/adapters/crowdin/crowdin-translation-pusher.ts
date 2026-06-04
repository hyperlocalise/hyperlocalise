import type { ExternalTmsTranslationPusher } from "@/lib/providers/tms-provider-types";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";

type FileUploadGroup = {
  fileId: number;
  locale: string;
  fileName: string;
  entries: Array<{ key: string; text: string }>;
};

function buildJsonUpload(entries: Array<{ key: string; text: string }>) {
  const payload: Record<string, string> = {};
  for (const entry of entries) {
    if (Object.prototype.hasOwnProperty.call(payload, entry.key)) {
      console.warn(`buildJsonUpload: duplicate key "${entry.key}" – later value kept`);
    }
    payload[entry.key] = entry.text;
  }
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  return new TextEncoder().encode(serialized);
}

export const pushCrowdinTranslations: ExternalTmsTranslationPusher = async ({
  credential,
  externalProjectId,
  externalJobId,
  secretMaterial,
  translations,
}) => {
  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  const projectId = Number(externalProjectId);
  const taskId = Number(externalJobId);
  if (Number.isNaN(projectId) || Number.isNaN(taskId)) {
    throw new Error("invalid_crowdin_project_or_task_id");
  }

  let task: Awaited<ReturnType<typeof client.getTask>>;
  try {
    task = await client.getTask(projectId, taskId);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const targetLanguageId = task.targetLanguageId ?? task.languageId;
  if (!targetLanguageId) {
    throw new Error("crowdin_task_missing_target_language");
  }

  let uploaded = 0;
  let failed = 0;
  const failures: Array<{ locale: string; message: string; fileId?: string | null }> = [];
  const asyncOperations: Array<Record<string, unknown>> = [];

  const groups = new Map<string, FileUploadGroup>();
  for (const translation of translations) {
    const fileId = Number(translation.fileId ?? task.fileIds?.[0]);
    if (Number.isNaN(fileId)) {
      failed += 1;
      failures.push({
        locale: translation.locale,
        fileId: translation.fileId ?? null,
        message: "crowdin_translation_missing_file_id",
      });
      continue;
    }

    const key = `${fileId}:${translation.locale}`;
    const existing = groups.get(key) ?? {
      fileId,
      locale: translation.locale,
      fileName: translation.fileName ?? `hyperlocalise-${fileId}-${translation.locale}.json`,
      entries: [],
    };

    const entryKey = translation.key ?? translation.externalStringId;
    if (!entryKey) {
      failed += 1;
      failures.push({
        locale: translation.locale,
        fileId: translation.fileId ?? null,
        message: "crowdin_translation_missing_key",
      });
      continue;
    }

    existing.entries.push({
      key: entryKey,
      text: translation.text,
    });
    groups.set(key, existing);
  }

  if (groups.size === 0) {
    return { uploaded, failed, failures, asyncOperations };
  }

  for (const group of groups.values()) {
    try {
      const storage = await client.addStorage({
        fileName: group.fileName,
        content: buildJsonUpload(group.entries),
        contentType: "application/json",
      });

      const importResult = await client.uploadTranslations(projectId, group.locale, {
        storageId: storage.id,
        fileId: group.fileId,
        autoApproveImported: true,
      });

      uploaded += group.entries.length;
      asyncOperations.push({
        type: "crowdin_upload_translations",
        storageId: storage.id,
        fileId: group.fileId,
        languageId: group.locale,
        importResult,
      });
    } catch (error) {
      failed += group.entries.length;
      failures.push({
        locale: group.locale,
        fileId: String(group.fileId),
        message: error instanceof Error ? error.message : "crowdin translation upload failed",
      });
      asyncOperations.push({
        type: "crowdin_upload_translations",
        fileId: group.fileId,
        languageId: group.locale,
        status: "failed",
        error: error instanceof Error ? error.message : "crowdin translation upload failed",
      });
    }
  }

  if (groups.size > 0 && uploaded === 0 && failed > 0) {
    return { uploaded, failed, failures, asyncOperations };
  }

  try {
    const build = await client.buildProjectTranslation(projectId, {
      targetLanguageIds: [targetLanguageId],
      exportApprovedOnly: true,
    });

    const finishedBuild = await client.waitForTranslationBuild(projectId, build.id);

    const downloadLink = await client.downloadTranslationBuild(projectId, finishedBuild.id);
    asyncOperations.push({
      type: "crowdin_translation_build",
      buildId: finishedBuild.id,
      status: finishedBuild.status,
      downloadUrl: downloadLink.url,
    });
  } catch (error) {
    asyncOperations.push({
      type: "crowdin_translation_build",
      status: "failed",
      error: error instanceof Error ? error.message : "crowdin translation build failed",
      responseBody: error instanceof CrowdinApiError ? error.responseBody : undefined,
    });
    failures.push({
      locale: targetLanguageId,
      fileId: null,
      message: error instanceof Error ? error.message : "crowdin translation build failed",
    });
  }

  return { uploaded, failed, failures, asyncOperations };
};
