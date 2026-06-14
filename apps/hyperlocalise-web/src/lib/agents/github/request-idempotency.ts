import { and, eq, lt, or } from "drizzle-orm";

import { db, schema } from "@/lib/database";

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

/** Max age for an enqueued row before it is purged and the idempotency key can be reused. */
export const GITHUB_AGENT_REQUEST_ENQUEUED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Max age for a claimed-but-never-enqueued row (e.g. crash after claim). */
export const GITHUB_AGENT_REQUEST_CLAIMED_STALE_MS = 60 * 60 * 1000;

export async function purgeExpiredGitHubAgentRequests() {
  const now = Date.now();
  await db
    .delete(schema.githubAgentRequests)
    .where(
      or(
        and(
          eq(schema.githubAgentRequests.status, "enqueued"),
          lt(
            schema.githubAgentRequests.createdAt,
            new Date(now - GITHUB_AGENT_REQUEST_ENQUEUED_TTL_MS),
          ),
        ),
        and(
          eq(schema.githubAgentRequests.status, "claimed"),
          lt(
            schema.githubAgentRequests.createdAt,
            new Date(now - GITHUB_AGENT_REQUEST_CLAIMED_STALE_MS),
          ),
        ),
      ),
    );
}

export function buildGitHubRepositoryRequestInput(input: {
  installationId: number;
  repositoryFullName: string;
  pullRequestNumber: number;
  commentId: number | null;
  instructions: string;
}): GitHubAgentRequestInput {
  return {
    requestKind: "repository",
    githubInstallationId: String(input.installationId),
    repositoryFullName: input.repositoryFullName,
    pullRequestNumber: input.pullRequestNumber,
    commentId: String(input.commentId ?? 0),
    scopeType: "repository",
    scopeKey: input.instructions,
  };
}

export async function claimGitHubAgentRequest(
  values: GitHubAgentRequestInput,
): Promise<GitHubAgentRequestClaim> {
  await purgeExpiredGitHubAgentRequests();

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
      status: schema.githubAgentRequests.status,
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

  if (existing.status !== "enqueued") {
    throw new Error("GitHub agent request is claimed but not enqueued");
  }

  return {
    alreadyQueued: true,
    requestId: existing.id,
    workflowRunIds: existing.workflowRunIds ?? [],
  };
}

export async function releaseGitHubAgentRequestClaim(requestId: string) {
  await db
    .delete(schema.githubAgentRequests)
    .where(
      and(
        eq(schema.githubAgentRequests.id, requestId),
        eq(schema.githubAgentRequests.status, "claimed"),
      ),
    );
}

export async function markGitHubAgentRequestEnqueued(input: {
  requestId: string;
  workflowRunIds: string[];
}) {
  const [updated] = await db
    .update(schema.githubAgentRequests)
    .set({
      status: "enqueued",
      workflowRunIds: input.workflowRunIds,
      updatedAt: new Date(),
    })
    .where(eq(schema.githubAgentRequests.id, input.requestId))
    .returning({ id: schema.githubAgentRequests.id });

  if (!updated) {
    throw new Error("GitHub agent request no longer exists");
  }
}
