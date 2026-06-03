import type {
  ExternalTmsJobTaskFetcher,
  ExternalTmsJobTaskMetadata,
} from "@/lib/providers/sync/external-tms-job-sync";

import { CrowdinApiClient, CrowdinApiError, type CrowdinTask } from "./crowdin-api";
import {
  extractCrowdinTaskPrimaryLanguageId,
  extractCrowdinTaskSourceLanguageId,
  extractCrowdinTaskTargetLocales,
} from "./crowdin-task-locales";

export function mapCrowdinTaskToJobTaskMetadata(
  task: CrowdinTask,
  localeReadinessByLanguage: Record<string, unknown>,
): ExternalTmsJobTaskMetadata {
  const targetLocales = extractCrowdinTaskTargetLocales(task);
  const sourceLanguageId = extractCrowdinTaskSourceLanguageId(task);
  const primaryLanguageId = extractCrowdinTaskPrimaryLanguageId(task);
  const localeReadinessKey = primaryLanguageId ?? targetLocales[0] ?? null;

  return {
    externalJobId: String(task.id),
    externalTaskId: null,
    externalStatus: task.status,
    title: task.title,
    dueDate: task.deadline ? new Date(task.deadline) : null,
    targetLocales,
    assignedUsers: task.assignees?.map((a) => (a.username ? a.username : String(a.id))) ?? [],
    externalUrl: task.webUrl,
    providerPayload: {
      type: task.type,
      description: task.description,
      fileIds: task.fileIds,
      languageId: primaryLanguageId ?? task.languageId,
      sourceLanguageId,
      targetLanguageId: task.targetLanguageId ?? null,
      targetLanguageIds: targetLocales,
      localeReadiness: localeReadinessKey
        ? (localeReadinessByLanguage[localeReadinessKey] ?? null)
        : localeReadinessByLanguage,
    },
    kind: mapTaskTypeToKind(task.type),
  };
}

export const fetchCrowdinJobTasks: ExternalTmsJobTaskFetcher = async ({
  credential,
  externalProjectId,
  secretMaterial,
}) => {
  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  const projectId = Number(externalProjectId);
  if (Number.isNaN(projectId)) {
    throw new Error("invalid_crowdin_project_id");
  }

  let tasks: Awaited<ReturnType<typeof client.listTasks>>;
  try {
    tasks = await client.listTasks(projectId);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  let progress: Awaited<ReturnType<typeof client.listProjectLanguageProgress>> = [];
  try {
    progress = await client.listProjectLanguageProgress(projectId);
  } catch {
    // Translation progress is best-effort; do not fail task sync if it is unavailable
  }

  const localeReadiness: Record<string, unknown> = {};
  for (const lang of progress) {
    localeReadiness[lang.languageId] = {
      translationProgress: lang.translationProgress,
      approvalProgress: lang.approvalProgress,
      words: lang.words,
      phrases: lang.phrases,
    };
  }

  return tasks.map((task) => mapCrowdinTaskToJobTaskMetadata(task, localeReadiness));
};

function mapTaskTypeToKind(
  taskType: number,
): "translation" | "research" | "review" | "sync" | "asset_management" {
  switch (taskType) {
    case 0: // translate by own translators
    case 2: // translate by vendor
      return "translation";
    case 1: // proofread by own proofreaders
    case 3: // proofread by vendor
      return "review";
    default:
      return "translation";
  }
}
