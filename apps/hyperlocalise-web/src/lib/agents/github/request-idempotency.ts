import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { GitHubFixRequestedEventData } from "@/lib/workflow/types";

export type GitHubAgentRequestClaim =
  | {
      alreadyQueued: false;
      requestId: string;
    }
  | {
      alreadyQueued: true;
      requestId: string;
      workflowRunIds: string[];
    };

type GitHubAgentRequestInput = {
  requestKind: string;
  githubInstallationId: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  commentId: string;
  scopeType: string;
  scopeKey: string;
};

function buildFixScopeKey(event: GitHubFixRequestedEventData) {
  if (event.scope.type === "pull_request") {
    return "pull_request";
  }

  return JSON.stringify({
    type: event.scope.type,
    path: event.scope.path,
    line: event.scope.line,
    originalLine: event.scope.originalLine,
    side: event.scope.side,
    commitSha: event.scope.commitSha,
    locale: event.scope.locale,
  });
}

function buildCommentId(event: GitHubFixRequestedEventData) {
  return String(event.trigger.commentId ?? event.trigger.deliveryId ?? "unknown");
}

export function buildGitHubFixRequestInput(
  event: GitHubFixRequestedEventData,
): GitHubAgentRequestInput {
  return {
    requestKind: "fix",
    githubInstallationId: String(event.installationId),
    repositoryFullName: event.repositoryFullName,
    pullRequestNumber: event.pullRequestNumber,
    commentId: buildCommentId(event),
    scopeType: event.scope.type,
    scopeKey: buildFixScopeKey(event),
  };
}

export async function claimGitHubAgentRequest(
  values: GitHubAgentRequestInput,
): Promise<GitHubAgentRequestClaim> {
  const [created] = await db
    .insert(schema.githubAgentRequests)
    .values(values)
    .onConflictDoNothing({
      target: [
        schema.githubAgentRequests.requestKind,
        schema.githubAgentRequests.githubInstallationId,
        schema.githubAgentRequests.repositoryFullName,
        schema.githubAgentRequests.pullRequestNumber,
        schema.githubAgentRequests.commentId,
        schema.githubAgentRequests.scopeKey,
      ],
    })
    .returning({ id: schema.githubAgentRequests.id });

  if (created) {
    return { alreadyQueued: false, requestId: created.id };
  }

  const [existing] = await db
    .select({
      id: schema.githubAgentRequests.id,
      workflowRunIds: schema.githubAgentRequests.workflowRunIds,
    })
    .from(schema.githubAgentRequests)
    .where(
      and(
        eq(schema.githubAgentRequests.requestKind, values.requestKind),
        eq(schema.githubAgentRequests.githubInstallationId, values.githubInstallationId),
        eq(schema.githubAgentRequests.repositoryFullName, values.repositoryFullName),
        eq(schema.githubAgentRequests.pullRequestNumber, values.pullRequestNumber),
        eq(schema.githubAgentRequests.commentId, values.commentId),
        eq(schema.githubAgentRequests.scopeKey, values.scopeKey),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("failed to read claimed GitHub agent request");
  }

  return {
    alreadyQueued: true,
    requestId: existing.id,
    workflowRunIds: existing.workflowRunIds ?? [],
  };
}

export async function markGitHubAgentRequestEnqueued(input: {
  requestId: string;
  workflowRunIds: string[];
}) {
  await db
    .update(schema.githubAgentRequests)
    .set({
      status: "enqueued",
      workflowRunIds: input.workflowRunIds,
      updatedAt: new Date(),
    })
    .where(eq(schema.githubAgentRequests.id, input.requestId));
}
