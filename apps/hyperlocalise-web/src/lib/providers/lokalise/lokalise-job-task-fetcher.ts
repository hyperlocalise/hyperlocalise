import type { ExternalTmsJobTaskFetcher } from "@/lib/providers/external-tms-job-sync";

import {
  buildLokaliseTaskUrl,
  collectLokaliseTaskAssignees,
  collectLokaliseTaskTargetLocales,
  LokaliseApiClient,
  LokaliseApiError,
  parseLokaliseTaskDueDate,
} from "./lokalise-api";

/** Lokalise task statuses for open and recently completed work. */
const LOKALISE_OPEN_AND_RECENT_TASK_STATUSES = [
  "created",
  "queued",
  "in_progress",
  "completed",
] as const;

export const fetchLokaliseJobTasks: ExternalTmsJobTaskFetcher = async ({
  credential,
  externalProjectId,
  secretMaterial,
}) => {
  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  let tasks: Awaited<ReturnType<typeof client.listTasks>>;
  try {
    tasks = await client.listTasks(externalProjectId, {
      filterStatuses: [...LOKALISE_OPEN_AND_RECENT_TASK_STATUSES],
    });
  } catch (error) {
    if (error instanceof LokaliseApiError && error.status === 401) {
      throw new Error("lokalise_auth_invalid");
    }
    throw error;
  }

  return tasks.map((task) => ({
    externalJobId: String(task.taskId),
    externalTaskId: null,
    externalStatus: task.status,
    title: task.title,
    dueDate: parseLokaliseTaskDueDate(task),
    targetLocales: collectLokaliseTaskTargetLocales(task),
    assignedUsers: collectLokaliseTaskAssignees(task),
    externalUrl: buildLokaliseTaskUrl(externalProjectId, task.taskId),
    providerPayload: {
      taskType: task.taskType,
      description: task.description,
      progress: task.progress,
      sourceLanguageIso: task.sourceLanguageIso,
      keysCount: task.keysCount,
      wordsCount: task.wordsCount,
      languages: task.languages.map((language) => ({
        languageIso: language.languageIso,
        languageName: language.languageName,
        status: language.status,
        progress: language.progress,
      })),
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    },
    kind: mapLokaliseTaskKind(task.taskType),
  }));
};

function mapLokaliseTaskKind(
  taskType: string,
): "translation" | "research" | "review" | "sync" | "asset_management" {
  switch (taskType) {
    case "review":
    case "lqa_by_ai":
      return "review";
    case "automatic_translation":
      return "sync";
    case "translation":
    default:
      return "translation";
  }
}
