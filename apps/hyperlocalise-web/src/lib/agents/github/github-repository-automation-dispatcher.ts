import { createLogger } from "@/lib/log";

import {
  buildGithubPushAutomationIdempotencyKey,
  buildGithubPushSkipIdempotencyKey,
  buildGithubScheduledAutomationIdempotencyKey,
} from "./github-repository-automation-idempotency";
import {
  buildGithubRepoAutomationDispatchPayload,
  hasEnabledGithubRepoAutomationWorkflow,
  shouldRunAutomationForPushBranch,
  type GithubRepoAutomationDispatchPayload,
} from "./github-repository-automation-settings";
import { getGithubRepositoryAutomationSettings } from "./github-repository-automation-settings-store";
import {
  claimGithubRepositoryAutomationJob,
  type GithubRepositoryAutomationJobRecord,
} from "./github-repository-automation-jobs";
import { enqueueGithubRepositoryAutomationJob } from "./github-repository-automation-worker";
import { githubRepositoryAutomationJobHasRunnableWorkflow } from "./github-repository-automation-workflows";

const logger = createLogger("github-repo-automation-dispatch");

export type GithubRepositoryAutomationDispatchResult =
  | {
      outcome: "enqueued";
      job: GithubRepositoryAutomationJobRecord;
      inserted: boolean;
    }
  | {
      outcome: "skipped";
      job: GithubRepositoryAutomationJobRecord;
      inserted: boolean;
      skipReason: string;
    };

export type GithubPushAutomationDispatchInput = {
  deliveryId: string;
  organizationId: string;
  githubInstallationId: string;
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
  branch: string;
  commitBefore: string;
  commitAfter: string;
};

export async function dispatchGithubRepositoryAutomationForPush(
  input: GithubPushAutomationDispatchInput,
): Promise<GithubRepositoryAutomationDispatchResult> {
  const settingsRecord = await getGithubRepositoryAutomationSettings({
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    githubRepositoryId: input.githubRepositoryId,
  });

  if (!hasEnabledGithubRepoAutomationWorkflow(settingsRecord.settings)) {
    return recordPushSkip({
      ...input,
      configVersion: settingsRecord.configVersion,
      skipReason: "automation_not_configured",
    });
  }

  if (settingsRecord.settings.trigger?.mode !== "push") {
    return recordPushSkip({
      ...input,
      configVersion: settingsRecord.configVersion,
      skipReason: "push_trigger_not_configured",
    });
  }

  if (!shouldRunAutomationForPushBranch(settingsRecord.settings, input.branch)) {
    return recordPushSkip({
      ...input,
      configVersion: settingsRecord.configVersion,
      skipReason: "branch_not_configured",
    });
  }

  const dispatchPayload = buildGithubRepoAutomationDispatchPayload({
    configVersion: settingsRecord.configVersion,
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    organizationId: input.organizationId,
    githubRepositoryId: input.githubRepositoryId,
    githubInstallationId: input.githubInstallationId,
    settings: settingsRecord.settings,
    pushBranch: input.branch,
  });

  if (!dispatchPayload) {
    return recordPushSkip({
      ...input,
      configVersion: settingsRecord.configVersion,
      skipReason: "automation_dispatch_unavailable",
    });
  }

  const claim = await claimGithubRepositoryAutomationJob({
    idempotencyKey: buildGithubPushAutomationIdempotencyKey({
      githubDeliveryId: input.deliveryId,
    }),
    organizationId: input.organizationId,
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    githubInstallationId: input.githubInstallationId,
    githubRepositoryId: input.githubRepositoryId,
    configVersion: dispatchPayload.configVersion,
    triggerMode: "push",
    triggerBranch: input.branch,
    commitBefore: input.commitBefore,
    commitAfter: input.commitAfter,
    workflows: dispatchPayload.workflows,
    githubDeliveryId: input.deliveryId,
  });

  logger.info(
    {
      jobId: claim.job.id,
      deliveryId: input.deliveryId,
      repositoryId: input.githubRepositoryId,
      inserted: claim.inserted,
    },
    "github repository automation job enqueued from push",
  );

  if (
    githubRepositoryAutomationJobHasRunnableWorkflow(dispatchPayload.workflows) &&
    claim.job.status === "queued"
  ) {
    await enqueueGithubRepositoryAutomationJob({ jobId: claim.job.id });
  }

  return {
    outcome: "enqueued",
    job: claim.job,
    inserted: claim.inserted,
  };
}

async function recordPushSkip(
  input: GithubPushAutomationDispatchInput & {
    configVersion: number;
    skipReason: string;
  },
): Promise<GithubRepositoryAutomationDispatchResult> {
  const claim = await claimGithubRepositoryAutomationJob({
    idempotencyKey: buildGithubPushSkipIdempotencyKey({
      githubDeliveryId: input.deliveryId,
      skipReason: input.skipReason,
    }),
    organizationId: input.organizationId,
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    githubInstallationId: input.githubInstallationId,
    githubRepositoryId: input.githubRepositoryId,
    configVersion: input.configVersion,
    triggerMode: "push",
    status: "skipped",
    skipReason: input.skipReason,
    triggerBranch: input.branch,
    commitBefore: input.commitBefore,
    commitAfter: input.commitAfter,
    githubDeliveryId: input.deliveryId,
  });

  logger.info(
    {
      jobId: claim.job.id,
      deliveryId: input.deliveryId,
      repositoryId: input.githubRepositoryId,
      skipReason: input.skipReason,
      inserted: claim.inserted,
    },
    "github repository automation push skipped",
  );

  return {
    outcome: "skipped",
    job: claim.job,
    inserted: claim.inserted,
    skipReason: input.skipReason,
  };
}

export type GithubScheduledAutomationDispatchInput = {
  organizationId: string;
  githubInstallationId: string;
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
  configVersion: number;
  scheduledRunAt: Date;
  dispatchPayload: GithubRepoAutomationDispatchPayload;
};

export async function dispatchGithubRepositoryAutomationForSchedule(
  input: GithubScheduledAutomationDispatchInput,
): Promise<GithubRepositoryAutomationDispatchResult> {
  const claim = await claimGithubRepositoryAutomationJob({
    idempotencyKey: buildGithubScheduledAutomationIdempotencyKey({
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
      configVersion: input.configVersion,
      scheduledRunAt: input.scheduledRunAt,
    }),
    organizationId: input.organizationId,
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    githubInstallationId: input.githubInstallationId,
    githubRepositoryId: input.githubRepositoryId,
    configVersion: input.dispatchPayload.configVersion,
    triggerMode: "scheduled",
    workflows: input.dispatchPayload.workflows,
    scheduledRunAt: input.scheduledRunAt,
  });

  logger.info(
    {
      jobId: claim.job.id,
      repositoryId: input.githubRepositoryId,
      scheduledRunAt: input.scheduledRunAt.toISOString(),
      inserted: claim.inserted,
    },
    "github repository automation job enqueued from schedule",
  );

  if (
    githubRepositoryAutomationJobHasRunnableWorkflow(input.dispatchPayload.workflows) &&
    claim.job.status === "queued"
  ) {
    await enqueueGithubRepositoryAutomationJob({ jobId: claim.job.id });
  }

  return {
    outcome: "enqueued",
    job: claim.job,
    inserted: claim.inserted,
  };
}
