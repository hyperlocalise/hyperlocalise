import { createLogger } from "@/lib/log";

import { dispatchGithubRepositoryAutomationForPush } from "./github-repository-automation-dispatcher";

const logger = createLogger("github-push-webhook");

export type GitHubPushWebhookPayload = {
  ref?: string;
  before?: string;
  after?: string;
  created?: boolean;
  deleted?: boolean;
};

export function parsePushBranchFromRef(ref: string | undefined): string | null {
  if (!ref?.startsWith("refs/heads/")) {
    return null;
  }

  const branch = ref.slice("refs/heads/".length).trim();
  return branch.length > 0 ? branch : null;
}

export type HandleGithubPushWebhookInput = {
  deliveryId: string;
  organizationId: string;
  githubInstallationId: string;
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
  payload: GitHubPushWebhookPayload;
};

export type HandleGithubPushWebhookResult = {
  ignored: boolean;
  automation?: {
    outcome: "enqueued" | "skipped";
    jobId: string;
    skipReason?: string;
  };
};

export async function handleGithubPushWebhook(
  input: HandleGithubPushWebhookInput,
): Promise<HandleGithubPushWebhookResult> {
  if (input.payload.deleted) {
    logger.info(
      { deliveryId: input.deliveryId, repositoryId: input.githubRepositoryId },
      "ignoring deleted branch push event",
    );
    return { ignored: true };
  }

  const branch = parsePushBranchFromRef(input.payload.ref);
  if (!branch) {
    logger.info(
      { deliveryId: input.deliveryId, repositoryId: input.githubRepositoryId },
      "ignoring push event without branch ref",
    );
    return { ignored: true };
  }

  const commitBefore = input.payload.before ?? "";
  const commitAfter = input.payload.after ?? "";
  if (!commitAfter) {
    logger.info(
      { deliveryId: input.deliveryId, repositoryId: input.githubRepositoryId },
      "ignoring push event without commit after sha",
    );
    return { ignored: true };
  }

  const dispatchResult = await dispatchGithubRepositoryAutomationForPush({
    deliveryId: input.deliveryId,
    organizationId: input.organizationId,
    githubInstallationId: input.githubInstallationId,
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    githubRepositoryId: input.githubRepositoryId,
    branch,
    commitBefore,
    commitAfter,
  });

  try {
    const { dispatchWorkspaceAutomationsForGithubPush } =
      await import("../workspace-automation-dispatcher");
    await dispatchWorkspaceAutomationsForGithubPush({
      deliveryId: input.deliveryId,
      organizationId: input.organizationId,
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
      branch,
      commitBefore,
      commitAfter,
    });
  } catch (error) {
    logger.error(
      {
        deliveryId: input.deliveryId,
        repositoryId: input.githubRepositoryId,
        error: error instanceof Error ? error.message : String(error),
      },
      "workspace automations github push dispatch failed",
    );
  }

  if (dispatchResult.outcome === "skipped") {
    return {
      ignored: false,
      automation: {
        outcome: "skipped",
        jobId: dispatchResult.job.id,
        skipReason: dispatchResult.skipReason,
      },
    };
  }

  return {
    ignored: false,
    automation: {
      outcome: "enqueued",
      jobId: dispatchResult.job.id,
    },
  };
}
