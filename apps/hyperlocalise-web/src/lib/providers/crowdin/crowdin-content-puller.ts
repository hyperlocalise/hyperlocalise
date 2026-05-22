import type { ExternalTmsContentPuller } from "@/lib/providers/external-tms-content-sync";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sourceTextValue(text: string | Record<string, string>): string {
  if (typeof text === "string") {
    return text;
  }

  return text.one ?? text.other ?? Object.values(text)[0] ?? "";
}

export const pullCrowdinTaskContent: ExternalTmsContentPuller = async ({
  credential,
  externalProjectId,
  externalJobId,
  secretMaterial,
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

  const fileIds = task.fileIds ?? [];
  const stringIds = task.stringIds ?? [];
  const sourceStrings: Awaited<ReturnType<typeof client.listSourceStrings>> = [];

  if (stringIds.length > 0) {
    for (const chunk of chunkArray(stringIds, 25)) {
      sourceStrings.push(...(await client.listSourceStrings(projectId, undefined, chunk)));
    }
  } else if (fileIds.length > 0) {
    for (const fileId of fileIds) {
      sourceStrings.push(...(await client.listSourceStrings(projectId, fileId)));
    }
  } else {
    sourceStrings.push(...(await client.listSourceStrings(projectId)));
  }

  const approvals = await client.listTranslationApprovals(projectId, targetLanguageId);
  const approvedTranslationIds = new Set(approvals.map((approval) => approval.translationId));

  const translationsByStringId = new Map<
    number,
    Awaited<ReturnType<typeof client.listLanguageTranslations>>
  >();
  const sourceStringIds = sourceStrings.map((sourceString) => sourceString.id);

  for (const chunk of chunkArray(sourceStringIds, 25)) {
    const batch = await client.listLanguageTranslations(projectId, targetLanguageId, {
      stringIds: chunk,
    });

    for (const translation of batch) {
      const existing = translationsByStringId.get(translation.stringId) ?? [];
      existing.push(translation);
      translationsByStringId.set(translation.stringId, existing);
    }
  }

  const units: Awaited<ReturnType<ExternalTmsContentPuller>>["units"] = sourceStrings.map(
    (sourceString) => {
      const translations = translationsByStringId.get(sourceString.id) ?? [];

      return {
        externalStringId: String(sourceString.id),
        key: sourceString.identifier,
        sourceText: sourceTextValue(sourceString.text),
        context: sourceString.context,
        fileId: sourceString.fileId ? String(sourceString.fileId) : null,
        translations: translations
          .filter((translation) => translation.text != null)
          .map((translation) => ({
            locale: targetLanguageId,
            text: translation.text as string,
            externalTranslationId:
              translation.translationId != null ? String(translation.translationId) : null,
            isApproved:
              translation.translationId != null &&
              approvedTranslationIds.has(translation.translationId),
          })),
        providerPayload: {
          type: sourceString.type,
          branchId: sourceString.branchId,
          directoryId: sourceString.directoryId,
        },
      };
    },
  );

  let exportArtifact: Awaited<ReturnType<ExternalTmsContentPuller>>["exportArtifact"] = null;
  try {
    const exportLink = await client.exportTaskStrings(projectId, taskId);
    if (exportLink?.url) {
      const bytes = await client.downloadUrl(exportLink.url);
      exportArtifact = {
        url: exportLink.url,
        byteLength: bytes.byteLength,
      };
    }
  } catch {
    // Task export is best-effort for agent workflows.
  }

  return {
    externalJobId: String(task.id),
    externalTaskId: null,
    sourceLocale: task.sourceLanguageId ?? null,
    targetLocales: [targetLanguageId],
    units,
    exportArtifact,
    providerPayload: {
      status: task.status,
      title: task.title,
      fileIds: task.fileIds,
      stringIds: task.stringIds,
      webUrl: task.webUrl,
    },
  };
};
