import type {
  ExternalTmsJobTaskFetcher,
  ExternalTmsJobTaskMetadata,
} from "@/lib/providers/tms-provider-types";

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
      projectId: task.projectId,
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

async function loadCrowdinLocaleReadiness(
  client: CrowdinApiClient,
  projectId: number,
  languageIds?: string[],
): Promise<Record<string, unknown>> {
  let progress: Awaited<ReturnType<typeof client.listProjectLanguageProgress>> = [];
  try {
    progress = await client.listProjectLanguageProgress(projectId, {
      languageIds,
    });
  } catch {
    // Translation progress is best-effort; do not fail task sync if it is unavailable
  }

  return mapCrowdinLanguageProgressToLocaleReadiness(progress);
}

export function mapCrowdinLanguageProgressToLocaleReadiness(
  progress: Awaited<ReturnType<CrowdinApiClient["listProjectLanguageProgress"]>>,
): Record<string, unknown> {
  const localeReadiness: Record<string, unknown> = {};
  for (const lang of progress) {
    localeReadiness[lang.languageId] = {
      translationProgress: lang.translationProgress,
      approvalProgress: lang.approvalProgress,
      words: lang.words,
      phrases: lang.phrases,
    };
  }
  return localeReadiness;
}

function createCrowdinJobTaskClient(input: {
  credential: { baseUrl?: string | null };
  secretMaterial: string;
}) {
  return new CrowdinApiClient({
    token: input.secretMaterial,
    baseUrl: input.credential.baseUrl ?? undefined,
  });
}

export const fetchCrowdinJobTasks: ExternalTmsJobTaskFetcher = async ({
  credential,
  externalProjectId,
  secretMaterial,
  includeLocaleProgress = false,
  fetchAllTasks = false,
}) => {
  const client = createCrowdinJobTaskClient({ credential, secretMaterial });

  const projectId = Number(externalProjectId);
  if (Number.isNaN(projectId)) {
    throw new Error("invalid_crowdin_project_id");
  }

  let tasks: Awaited<ReturnType<typeof client.listTasks>>;
  try {
    tasks = await client.listTasks(projectId, { fetchAll: fetchAllTasks });
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const localeReadiness = includeLocaleProgress
    ? await loadCrowdinLocaleReadiness(client, projectId)
    : {};

  return tasks.map((task) => mapCrowdinTaskToJobTaskMetadata(task, localeReadiness));
};

export async function fetchCrowdinUserJobTasks(input: {
  credential: { baseUrl?: string | null };
  secretMaterial: string;
  externalProjectId?: string;
  fetchAllTasks?: boolean;
}): Promise<ExternalTmsJobTaskMetadata[]> {
  const client = createCrowdinJobTaskClient(input);

  const projectId =
    input.externalProjectId !== undefined ? Number(input.externalProjectId) : undefined;
  if (projectId !== undefined && Number.isNaN(projectId)) {
    throw new Error("invalid_crowdin_project_id");
  }

  let tasks: Awaited<ReturnType<typeof client.listUserTasks>>;
  try {
    tasks = await client.listUserTasks({
      ...(projectId !== undefined ? { projectId } : {}),
      fetchAll: input.fetchAllTasks ?? false,
    });
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  return tasks.map((task) => mapCrowdinTaskToJobTaskMetadata(task, {}));
}

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
