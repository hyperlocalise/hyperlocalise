import { createLogger } from "@/lib/log";
import type { ExternalTmsContentPuller } from "@/lib/providers/tms-provider-types";

import {
  CrowdinApiClient,
  CrowdinApiError,
  type CrowdinSourceString,
  type CrowdinTaskDetails,
} from "./crowdin-api";

const logger = createLogger("crowdin-content-puller");

export type CrowdinTaskStringPullStrategy = "taskId" | "stringIds" | "fileIds" | "none";

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

function dedupeSourceStringsById(strings: CrowdinSourceString[]): CrowdinSourceString[] {
  const byId = new Map<number, CrowdinSourceString>();
  for (const sourceString of strings) {
    byId.set(sourceString.id, sourceString);
  }
  return [...byId.values()];
}

async function listSourceStringsByStringIds(
  client: CrowdinApiClient,
  projectId: number,
  stringIds: number[],
): Promise<CrowdinSourceString[]> {
  const uniqueIds = [...new Set(stringIds)];
  const results: CrowdinSourceString[] = [];

  for (const chunk of chunkArray(uniqueIds, 25)) {
    const croql = `id in (${chunk.join(",")})`;
    const page = await client.listSourceStrings(projectId, { croql });
    results.push(...page);
  }

  return dedupeSourceStringsById(results);
}

async function listSourceStringsByFileIds(
  client: CrowdinApiClient,
  projectId: number,
  fileIds: number[],
): Promise<{ strings: CrowdinSourceString[]; countsByFileId: Record<string, number> }> {
  const uniqueFileIds = [...new Set(fileIds)];
  const results: CrowdinSourceString[] = [];
  const countsByFileId: Record<string, number> = {};

  for (const fileId of uniqueFileIds) {
    const fileStrings = await client.listSourceStrings(projectId, { fileId });
    countsByFileId[String(fileId)] = fileStrings.length;
    results.push(...fileStrings);
  }

  return {
    strings: dedupeSourceStringsById(results),
    countsByFileId,
  };
}

async function resolveCrowdinTaskSourceStrings(input: {
  client: CrowdinApiClient;
  projectId: number;
  taskId: number;
  task: CrowdinTaskDetails;
}): Promise<{
  sourceStrings: CrowdinSourceString[];
  pullStrategy: CrowdinTaskStringPullStrategy;
  countsByFileId?: Record<string, number>;
}> {
  const logContext = {
    crowdinProjectId: input.projectId,
    crowdinTaskId: input.taskId,
    taskFileIdCount: input.task.fileIds?.length ?? 0,
    taskStringIdCount: input.task.stringIds?.length ?? 0,
  };

  const taskIdStrings = await input.client.listSourceStrings(input.projectId, {
    taskId: input.taskId,
  });

  if (taskIdStrings.length > 0) {
    logger.info(
      {
        ...logContext,
        pullStrategy: "taskId",
        stringCount: taskIdStrings.length,
      },
      "crowdin task source strings loaded via taskId filter",
    );
    return { sourceStrings: taskIdStrings, pullStrategy: "taskId" };
  }

  logger.info(
    {
      ...logContext,
      pullStrategy: "taskId",
      stringCount: 0,
    },
    "crowdin taskId string filter returned no strings; trying fallbacks",
  );

  const taskStringIds = (input.task.stringIds ?? []).filter(
    (stringId): stringId is number => typeof stringId === "number" && Number.isFinite(stringId),
  );
  if (taskStringIds.length > 0) {
    const stringIdStrings = await listSourceStringsByStringIds(
      input.client,
      input.projectId,
      taskStringIds,
    );

    if (stringIdStrings.length > 0) {
      logger.info(
        {
          ...logContext,
          pullStrategy: "stringIds",
          requestedStringIdCount: taskStringIds.length,
          stringCount: stringIdStrings.length,
        },
        "crowdin task source strings loaded via task stringIds fallback",
      );
      return { sourceStrings: stringIdStrings, pullStrategy: "stringIds" };
    }

    logger.warn(
      {
        ...logContext,
        pullStrategy: "stringIds",
        requestedStringIdCount: taskStringIds.length,
        stringCount: 0,
      },
      "crowdin task stringIds fallback returned no strings",
    );
  }

  const taskFileIds = (input.task.fileIds ?? []).filter(
    (fileId): fileId is number => typeof fileId === "number" && Number.isFinite(fileId),
  );
  if (taskFileIds.length > 0) {
    const { strings, countsByFileId } = await listSourceStringsByFileIds(
      input.client,
      input.projectId,
      taskFileIds,
    );

    if (strings.length > 0) {
      logger.info(
        {
          ...logContext,
          pullStrategy: "fileIds",
          fileIds: taskFileIds,
          countsByFileId,
          stringCount: strings.length,
        },
        "crowdin task source strings loaded via task fileIds fallback",
      );
      return { sourceStrings: strings, pullStrategy: "fileIds", countsByFileId };
    }

    logger.warn(
      {
        ...logContext,
        pullStrategy: "fileIds",
        fileIds: taskFileIds,
        countsByFileId,
        stringCount: 0,
      },
      "crowdin task fileIds fallback returned no strings",
    );
  }

  logger.warn(
    {
      ...logContext,
      pullStrategy: "none",
      stringCount: 0,
    },
    "crowdin task string pull exhausted all strategies with no strings",
  );

  return { sourceStrings: [], pullStrategy: "none" };
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

  let task: CrowdinTaskDetails;
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

  const { sourceStrings, pullStrategy, countsByFileId } = await resolveCrowdinTaskSourceStrings({
    client,
    projectId,
    taskId,
    task,
  });

  const approvals = await client.listTranslationApprovalsForSourceStrings(
    projectId,
    targetLanguageId,
    sourceStrings,
  );
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

  logger.info(
    {
      crowdinProjectId: projectId,
      crowdinTaskId: taskId,
      pullStrategy,
      stringCount: sourceStrings.length,
      unitCount: units.length,
      unitsWithSourceText: units.filter((unit) => unit.sourceText.trim().length > 0).length,
      translationCount: units.reduce((total, unit) => total + unit.translations.length, 0),
      ...(countsByFileId ? { countsByFileId } : {}),
    },
    "crowdin task content pull completed",
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
      stringPullStrategy: pullStrategy,
      ...(countsByFileId ? { stringPullCountsByFileId: countsByFileId } : {}),
    },
  };
};
