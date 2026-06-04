import type { ExternalTmsTaskContent } from "@/lib/providers/tms-provider-types";
import { buildProviderReviewReport } from "@/lib/providers/provider-job-review/normalize-provider-review";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";

import {
  collectLokaliseTaskKeyIds,
  LOKALISE_DEFAULT_BASE_URL,
  LokaliseApiClient,
  LokaliseApiError,
  parseLokaliseExternalJobId,
} from "./lokalise-api";
import { normalizeLokaliseKeyCommentToThread } from "./lokalise-review-normalize";

function rethrowLokaliseAuthError(error: unknown): never {
  if (error instanceof LokaliseApiError && error.status === 401) {
    throw new Error("lokalise_auth_invalid");
  }
  throw error;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export type LokaliseReviewPullInput = {
  credential: { baseUrl?: string | null };
  secretMaterial: string;
  externalProjectId: string;
  externalJobId: string;
  content: ExternalTmsTaskContent;
  fetchFn?: typeof fetch;
};

export async function pullLokaliseProviderReview(
  input: LokaliseReviewPullInput,
): Promise<ProviderReviewReport> {
  const projectId = input.externalProjectId.trim();
  const parsedJobId = parseLokaliseExternalJobId(input.externalJobId);
  if (!projectId || !parsedJobId) {
    throw new Error("invalid_lokalise_project_or_task_id");
  }

  const client = new LokaliseApiClient({
    token: input.secretMaterial,
    baseUrl: input.credential.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
    fetchFn: input.fetchFn,
  });

  let task: Awaited<ReturnType<typeof client.getTask>>;
  try {
    task = await client.getTask(projectId, parsedJobId.taskId);
  } catch (error) {
    rethrowLokaliseAuthError(error);
  }

  const stringKeyById = new Map(
    input.content.units.map((unit) => [unit.externalStringId, unit.key] as const),
  );

  const keyIds = new Set<number>();
  for (const unit of input.content.units) {
    const keyId = Number(unit.externalStringId);
    if (!Number.isNaN(keyId) && keyId > 0) {
      keyIds.add(keyId);
    }
  }

  for (const keyId of collectLokaliseTaskKeyIds(task)) {
    keyIds.add(keyId);
  }

  const keyIdList = [...keyIds];
  const comments: Awaited<ReturnType<typeof client.listKeyComments>> = [];

  if (keyIdList.length === 0) {
    return buildProviderReviewReport([]);
  }

  try {
    for (const chunk of chunkArray(keyIdList, 25)) {
      const chunkResults = await Promise.all(
        chunk.map((keyId) => client.listKeyComments(projectId, keyId)),
      );
      for (const keyComments of chunkResults) {
        comments.push(...keyComments);
      }
    }
  } catch (error) {
    rethrowLokaliseAuthError(error);
  }

  const threads = comments.map((comment) =>
    normalizeLokaliseKeyCommentToThread({
      comment,
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      stringKeyById,
    }),
  );

  const deduped = new Map(threads.map((thread) => [thread.threadId, thread] as const));

  return buildProviderReviewReport([...deduped.values()]);
}
