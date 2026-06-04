import type { ExternalTmsJobTaskFetcher } from "@/lib/providers/tms-provider-types";

import {
  buildLokaliseTaskUrl,
  collectLokaliseTaskAssignees,
  collectLokaliseTaskTargetLocales,
  getLokaliseTaskCompletionMs,
  LOKALISE_COMPLETED_TASK_MAX_PAGES,
  LOKALISE_RECENT_COMPLETED_WINDOW_MS,
  LokaliseApiClient,
  LokaliseApiError,
  type LokaliseTask,
  parseLokaliseTaskDueDate,
} from "./lokalise-api";

const LOKALISE_OPEN_TASK_STATUSES = ["created", "queued", "in_progress"] as const;

export const fetchLokaliseJobTasks: ExternalTmsJobTaskFetcher = async ({
  credential,
  externalProjectId,
  secretMaterial,
}) => {
  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  let tasks: LokaliseTask[];
  try {
    tasks = await listOpenAndRecentLokaliseTasks(client, externalProjectId);
  } catch (error) {
    if (error instanceof LokaliseApiError && error.status === 401) {
      throw new Error("lokalise_auth_invalid");
    }
    throw error;
  }

  return tasks.map((task) => {
    const completedAtMs = getLokaliseTaskCompletionMs(task);

    return {
      externalJobId: String(task.taskId),
      externalTaskId: null,
      externalStatus: task.status,
      title: task.title,
      dueDate: parseLokaliseTaskDueDate(task),
      targetLocales: collectLokaliseTaskTargetLocales(task),
      assignedUsers: collectLokaliseTaskAssignees(task),
      externalUrl: buildLokaliseTaskUrl(externalProjectId, task.taskId),
      completedAt: completedAtMs != null ? new Date(completedAtMs).toISOString() : null,
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
    };
  });
};

async function listOpenAndRecentLokaliseTasks(client: LokaliseApiClient, projectId: string) {
  const completedAfterMs = Date.now() - LOKALISE_RECENT_COMPLETED_WINDOW_MS;

  const [openTasks, recentCompletedTasks] = await Promise.all([
    client.listTasks(projectId, { filterStatuses: [...LOKALISE_OPEN_TASK_STATUSES] }),
    client.listTasks(projectId, {
      filterStatuses: ["completed"],
      maxPages: LOKALISE_COMPLETED_TASK_MAX_PAGES,
      completedAfterMs,
    }),
  ]);

  const tasksById = new Map<number, LokaliseTask>();
  for (const task of [...openTasks, ...recentCompletedTasks]) {
    tasksById.set(task.taskId, task);
  }

  return [...tasksById.values()];
}

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
