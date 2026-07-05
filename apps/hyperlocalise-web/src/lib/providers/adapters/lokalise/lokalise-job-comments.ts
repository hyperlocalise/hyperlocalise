import type { TmsProviderLiveJobComment } from "@/lib/providers/tms-provider-live";

import {
  collectLokaliseTaskKeyIds,
  LokaliseApiClient,
  LokaliseApiError,
  parseLokaliseExternalJobId,
} from "./lokalise-api";

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function listLokaliseTaskComments(input: {
  secretMaterial: string;
  baseUrl?: string | null;
  externalProjectId: string;
  externalJobId: string;
}): Promise<TmsProviderLiveJobComment[] | null> {
  const projectId = input.externalProjectId.trim();
  const parsedJobId = parseLokaliseExternalJobId(input.externalJobId);
  if (!projectId || !parsedJobId) {
    return null;
  }

  const client = new LokaliseApiClient({
    token: input.secretMaterial,
    baseUrl: input.baseUrl,
  });

  let task: Awaited<ReturnType<typeof client.getTask>>;
  try {
    task = await client.getTask(projectId, parsedJobId.taskId);
  } catch (error) {
    if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
      throw new Error("lokalise_auth_invalid");
    }
    if (error instanceof LokaliseApiError && error.status === 404) {
      return null;
    }
    throw error;
  }

  const keyIds = collectLokaliseTaskKeyIds(task);
  if (keyIds.length === 0) {
    return [];
  }

  const comments: Awaited<ReturnType<typeof client.listKeyComments>> = [];
  try {
    for (const chunk of chunkArray(keyIds, 25)) {
      const chunkResults = await Promise.all(
        chunk.map((keyId) => client.listKeyComments(projectId, keyId)),
      );
      for (const keyComments of chunkResults) {
        comments.push(...keyComments);
      }
    }
  } catch (error) {
    if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
      throw new Error("lokalise_auth_invalid");
    }
    throw error;
  }

  return comments.map((comment) => ({
    id: `lokalise:key-comment:${comment.commentId}`,
    externalCommentId: String(comment.commentId),
    userId: String(comment.addedBy ?? comment.addedByEmail ?? "unknown"),
    taskId: String(parsedJobId.taskId),
    text: comment.comment,
    timeSpentSeconds: null,
    createdAt: comment.addedAt ?? "",
    updatedAt: comment.addedAt ?? "",
  }));
}
