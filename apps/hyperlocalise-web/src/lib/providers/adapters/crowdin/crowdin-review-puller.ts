import type { ExternalTmsTaskContent } from "@/lib/providers/sync/external-tms-content-sync";
import { buildProviderReviewReport } from "@/lib/providers/provider-job-review/normalize-provider-review";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";
import {
  normalizeCrowdinStringCommentToThread,
  normalizeCrowdinTaskCommentToThread,
} from "./crowdin-review-normalize";

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export type CrowdinReviewPullInput = {
  credential: { baseUrl?: string | null };
  secretMaterial: string;
  externalProjectId: string;
  externalJobId: string;
  content: ExternalTmsTaskContent;
  fetchFn?: typeof fetch;
};

export async function pullCrowdinProviderReview(
  input: CrowdinReviewPullInput,
): Promise<ProviderReviewReport> {
  const client = new CrowdinApiClient({
    token: input.secretMaterial,
    baseUrl: input.credential.baseUrl ?? undefined,
    fetchFn: input.fetchFn,
  });

  const projectId = Number(input.externalProjectId);
  const taskId = Number(input.externalJobId);
  if (
    !input.externalProjectId.trim() ||
    !input.externalJobId.trim() ||
    Number.isNaN(projectId) ||
    Number.isNaN(taskId)
  ) {
    throw new Error("invalid_crowdin_project_or_task_id");
  }

  let task: Awaited<ReturnType<typeof client.getTask>>;
  let project: Awaited<ReturnType<typeof client.getProject>>;
  try {
    [task, project] = await Promise.all([
      client.getTask(projectId, taskId),
      client.getProject(projectId),
    ]);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const stringKeyById = new Map(
    input.content.units.map((unit) => [unit.externalStringId, unit.key] as const),
  );

  const stringIds = new Set<number>();
  for (const unit of input.content.units) {
    const stringId = Number(unit.externalStringId);
    if (!Number.isNaN(stringId)) {
      stringIds.add(stringId);
    }
  }

  if (task.stringIds) {
    for (const stringId of task.stringIds) {
      stringIds.add(stringId);
    }
  }

  const stringComments: Awaited<ReturnType<typeof client.listStringComments>> = [];
  const stringIdList = [...stringIds];

  if (stringIdList.length === 0) {
    // No job-specific string IDs available — skip string comment fetch to avoid
    // pulling in comments from unrelated jobs in the same project.
  } else {
    for (const chunk of chunkArray(stringIdList, 25)) {
      const chunkResults = await Promise.all(
        chunk.map((stringId) => client.listStringComments(projectId, { stringId })),
      );
      for (const comments of chunkResults) {
        stringComments.push(...comments);
      }
    }
  }

  const taskComments = await client.listTaskComments(projectId, taskId);

  const threads = [
    ...stringComments.map((comment) =>
      normalizeCrowdinStringCommentToThread({
        comment,
        externalProjectId: input.externalProjectId,
        externalJobId: input.externalJobId,
        projectWebUrl: project.webUrl,
        stringKeyById,
      }),
    ),
    ...taskComments.map((comment) =>
      normalizeCrowdinTaskCommentToThread({
        comment,
        externalProjectId: input.externalProjectId,
        externalJobId: input.externalJobId,
        taskWebUrl: task.webUrl,
      }),
    ),
  ];

  const deduped = new Map(threads.map((thread) => [thread.threadId, thread] as const));

  return buildProviderReviewReport([...deduped.values()]);
}
