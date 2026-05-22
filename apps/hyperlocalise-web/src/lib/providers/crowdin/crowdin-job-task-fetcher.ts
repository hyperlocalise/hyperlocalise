import type { ExternalTmsJobTaskFetcher } from "@/lib/providers/external-tms-job-sync";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";

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

  return tasks.map((task) => ({
    externalJobId: String(task.id),
    externalTaskId: null,
    externalStatus: task.status,
    title: task.title,
    dueDate: task.deadline ? new Date(task.deadline) : null,
    targetLocales: task.languageId ? [task.languageId] : [],
    assignedUsers: task.assignees?.map((a) => (a.username ? a.username : String(a.id))) ?? [],
    externalUrl: task.webUrl,
    providerPayload: {
      type: task.type,
      description: task.description,
      fileIds: task.fileIds,
      languageId: task.languageId,
      localeReadiness: task.languageId ? localeReadiness[task.languageId] : localeReadiness,
    },
    kind: mapTaskTypeToKind(task.type),
  }));
};

function mapTaskTypeToKind(
  taskType: string,
): "translation" | "research" | "review" | "sync" | "asset_management" {
  switch (taskType.toLowerCase()) {
    case "translate":
    case "translation":
      return "translation";
    case "proofread":
    case "review":
      return "review";
    case "import":
    case "export":
      return "sync";
    default:
      return "translation";
  }
}
