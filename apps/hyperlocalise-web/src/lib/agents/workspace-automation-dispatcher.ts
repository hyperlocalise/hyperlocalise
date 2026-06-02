import { createLogger } from "@/lib/log";

import {
  buildGithubPushAutomationIdempotencyKey,
  buildGithubScheduledAutomationIdempotencyKey,
} from "./github/github-repository-automation-idempotency";
import {
  buildGithubRepoAutomationDispatchPayload,
  shouldRunAutomationForPushBranch,
} from "./github/github-repository-automation-settings";
import {
  claimGithubRepositoryAutomationJob,
  type GithubRepositoryAutomationJobRecord,
} from "./github/github-repository-automation-jobs";
import { enqueueGithubRepositoryAutomationJob } from "./github/github-repository-automation-worker";
import { githubRepositoryAutomationJobHasRunnableWorkflow } from "./github/github-repository-automation-workflows";
import {
  buildWorkspaceGithubPushAutomationIdempotencyKey,
  buildWorkspaceManualAutomationIdempotencyKey,
  buildWorkspaceScheduledAutomationIdempotencyKey,
} from "./workspace-automation-idempotency";
import {
  hasWorkspaceAutomationGithubWorkflow,
  workspaceAutomationMatchesPushBranch,
  workspaceAutomationToGithubSettings,
} from "./workspace-automation-github-mapping";
import {
  advanceWorkspaceAutomationNextRun,
  createWorkspaceAutomationRun,
  listWorkspaceAutomations,
  updateWorkspaceAutomationRun,
  type WorkspaceAutomationRecord,
} from "./workspace-automations";

const logger = createLogger("workspace-automation-dispatch");

export type WorkspaceAutomationDispatchResult =
  | {
      outcome: "enqueued";
      runId: string;
      job: GithubRepositoryAutomationJobRecord;
      inserted: boolean;
    }
  | {
      outcome: "skipped";
      runId: string;
      job: GithubRepositoryAutomationJobRecord;
      inserted: boolean;
      skipReason: string;
    };

async function linkWorkspaceAutomationRun(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  triggerSource: "manual" | "scheduled" | "github";
  idempotencyKey: string;
  scheduledRunAt?: Date;
  githubDeliveryId?: string;
  pushBranch?: string;
  commitBefore?: string;
  commitAfter?: string;
  inputSnapshot?: Record<string, unknown>;
  dispatchPayload: NonNullable<ReturnType<typeof buildGithubRepoAutomationDispatchPayload>>;
  repository: {
    id: string;
    githubInstallationId: string;
    githubRepositoryId: string;
  };
}): Promise<WorkspaceAutomationDispatchResult> {
  const run = await createWorkspaceAutomationRun({
    automationId: input.automation.id,
    organizationId: input.organizationId,
    triggerSource: input.triggerSource,
    status: "queued",
    idempotencyKey: input.idempotencyKey,
    inputSnapshot: {
      ...input.inputSnapshot,
      automationConfigVersion: input.automation.configVersion,
      automationName: input.automation.name,
      instructions: input.automation.instructions,
      ...(input.scheduledRunAt ? { scheduledRunAt: input.scheduledRunAt.toISOString() } : {}),
      ...(input.githubDeliveryId ? { githubDeliveryId: input.githubDeliveryId } : {}),
      ...(input.pushBranch ? { pushBranch: input.pushBranch } : {}),
      ...(input.commitBefore ? { commitBefore: input.commitBefore } : {}),
      ...(input.commitAfter ? { commitAfter: input.commitAfter } : {}),
    },
  });

  const githubIdempotencyKey =
    input.triggerSource === "manual"
      ? buildWorkspaceManualAutomationIdempotencyKey({
          automationId: input.automation.id,
          configVersion: input.dispatchPayload.configVersion,
          idempotencyKey: input.idempotencyKey,
        })
      : input.triggerSource === "scheduled" && input.scheduledRunAt
        ? buildGithubScheduledAutomationIdempotencyKey({
            githubInstallationRepositoryId: input.repository.id,
            configVersion: input.dispatchPayload.configVersion,
            scheduledRunAt: input.scheduledRunAt,
          })
        : buildGithubPushAutomationIdempotencyKey({
            githubDeliveryId: input.githubDeliveryId ?? run.id,
          });

  const claim = await claimGithubRepositoryAutomationJob({
    idempotencyKey: githubIdempotencyKey,
    organizationId: input.organizationId,
    githubInstallationRepositoryId: input.repository.id,
    githubInstallationId: input.repository.githubInstallationId,
    githubRepositoryId: input.repository.githubRepositoryId,
    configVersion: input.dispatchPayload.configVersion,
    triggerMode: input.triggerSource === "github" ? "push" : "scheduled",
    triggerBranch: input.pushBranch ?? null,
    commitBefore: input.commitBefore ?? null,
    commitAfter: input.commitAfter ?? null,
    workflows: input.dispatchPayload.workflows,
    githubDeliveryId: input.githubDeliveryId ?? null,
    scheduledRunAt: input.scheduledRunAt ?? null,
  });

  await updateWorkspaceAutomationRun({
    runId: run.id,
    organizationId: input.organizationId,
    githubRepositoryAutomationJobId: claim.job.id,
    status: claim.job.status === "skipped" ? "skipped" : "queued",
    outputSummary:
      claim.job.status === "skipped"
        ? { skipReason: claim.job.skipReason ?? "automation_skipped" }
        : {},
    completedAt: claim.job.status === "skipped" ? new Date() : null,
  });

  if (
    claim.job.status !== "skipped" &&
    githubRepositoryAutomationJobHasRunnableWorkflow(input.dispatchPayload.workflows) &&
    claim.job.status === "queued"
  ) {
    await enqueueGithubRepositoryAutomationJob({ jobId: claim.job.id });
  }

  if (claim.job.status === "skipped") {
    return {
      outcome: "skipped",
      runId: run.id,
      job: claim.job,
      inserted: claim.inserted,
      skipReason: claim.job.skipReason ?? "automation_skipped",
    };
  }

  return {
    outcome: "enqueued",
    runId: run.id,
    job: claim.job,
    inserted: claim.inserted,
  };
}

export async function dispatchManualWorkspaceAutomationRun(input: {
  automation: WorkspaceAutomationRecord;
  repository: {
    id: string;
    githubInstallationId: string;
    githubRepositoryId: string;
  };
  idempotencyKey: string;
  inputSnapshot?: Record<string, unknown>;
}): Promise<WorkspaceAutomationDispatchResult | null> {
  if (input.automation.status !== "active") {
    return null;
  }

  if (!hasWorkspaceAutomationGithubWorkflow(input.automation.toolConfig)) {
    return null;
  }

  if (input.automation.triggerConfig.mode !== "manual") {
    return null;
  }

  const githubSettings = workspaceAutomationToGithubSettings(input.automation);
  if (!githubSettings) {
    return null;
  }

  const dispatchPayload = buildGithubRepoAutomationDispatchPayload({
    configVersion: input.automation.configVersion,
    githubInstallationRepositoryId: input.repository.id,
    organizationId: input.automation.organizationId,
    githubRepositoryId: input.repository.githubRepositoryId,
    githubInstallationId: input.repository.githubInstallationId,
    settings: githubSettings,
  });

  if (!dispatchPayload) {
    return null;
  }

  return linkWorkspaceAutomationRun({
    organizationId: input.automation.organizationId,
    automation: input.automation,
    triggerSource: "manual",
    idempotencyKey: input.idempotencyKey,
    inputSnapshot: input.inputSnapshot,
    dispatchPayload,
    repository: input.repository,
  });
}

export async function dispatchWorkspaceAutomationForSchedule(input: {
  automation: WorkspaceAutomationRecord;
  repository: {
    id: string;
    githubInstallationId: string;
    githubRepositoryId: string;
  };
  scheduledRunAt: Date;
}): Promise<WorkspaceAutomationDispatchResult | null> {
  if (input.automation.status !== "active") {
    return null;
  }

  if (!hasWorkspaceAutomationGithubWorkflow(input.automation.toolConfig)) {
    return null;
  }

  if (input.automation.triggerConfig.mode !== "scheduled") {
    return null;
  }

  const githubSettings = workspaceAutomationToGithubSettings(input.automation);
  if (!githubSettings) {
    return null;
  }

  const dispatchPayload = buildGithubRepoAutomationDispatchPayload({
    configVersion: input.automation.configVersion,
    githubInstallationRepositoryId: input.repository.id,
    organizationId: input.automation.organizationId,
    githubRepositoryId: input.repository.githubRepositoryId,
    githubInstallationId: input.repository.githubInstallationId,
    settings: githubSettings,
  });

  if (!dispatchPayload) {
    return null;
  }

  const idempotencyKey = buildWorkspaceScheduledAutomationIdempotencyKey({
    automationId: input.automation.id,
    configVersion: input.automation.configVersion,
    scheduledRunAt: input.scheduledRunAt,
  });

  return linkWorkspaceAutomationRun({
    organizationId: input.automation.organizationId,
    automation: input.automation,
    triggerSource: "scheduled",
    idempotencyKey,
    scheduledRunAt: input.scheduledRunAt,
    dispatchPayload,
    repository: input.repository,
  });
}

export async function dispatchWorkspaceAutomationsForGithubPush(input: {
  deliveryId: string;
  organizationId: string;
  githubInstallationId: string;
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
  branch: string;
  commitBefore: string;
  commitAfter: string;
}): Promise<WorkspaceAutomationDispatchResult[]> {
  const automations = (
    await listWorkspaceAutomations({
      organizationId: input.organizationId,
      status: "active",
      limit: 100,
    })
  ).filter(
    (automation) =>
      automation.repositoryTarget.kind === "github" &&
      automation.repositoryTarget.githubInstallationRepositoryId ===
        input.githubInstallationRepositoryId &&
      automation.triggerConfig.mode === "github" &&
      workspaceAutomationMatchesPushBranch(automation, input.branch),
  );

  const results: WorkspaceAutomationDispatchResult[] = [];

  for (const automation of automations) {
    if (!hasWorkspaceAutomationGithubWorkflow(automation.toolConfig)) {
      continue;
    }

    const githubSettings = workspaceAutomationToGithubSettings(automation);
    if (!githubSettings || githubSettings.trigger?.mode !== "push") {
      continue;
    }

    if (!shouldRunAutomationForPushBranch(githubSettings, input.branch)) {
      continue;
    }

    const dispatchPayload = buildGithubRepoAutomationDispatchPayload({
      configVersion: automation.configVersion,
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
      organizationId: input.organizationId,
      githubRepositoryId: input.githubRepositoryId,
      githubInstallationId: input.githubInstallationId,
      settings: githubSettings,
      pushBranch: input.branch,
    });

    if (!dispatchPayload) {
      continue;
    }

    try {
      const result = await linkWorkspaceAutomationRun({
        organizationId: input.organizationId,
        automation,
        triggerSource: "github",
        idempotencyKey: buildWorkspaceGithubPushAutomationIdempotencyKey({
          automationId: automation.id,
          configVersion: automation.configVersion,
          githubDeliveryId: input.deliveryId,
        }),
        githubDeliveryId: input.deliveryId,
        pushBranch: input.branch,
        commitBefore: input.commitBefore,
        commitAfter: input.commitAfter,
        dispatchPayload,
        repository: {
          id: input.githubInstallationRepositoryId,
          githubInstallationId: input.githubInstallationId,
          githubRepositoryId: input.githubRepositoryId,
        },
      });
      results.push(result);
    } catch (error) {
      logger.error(
        {
          automationId: automation.id,
          deliveryId: input.deliveryId,
          error: error instanceof Error ? error.message : String(error),
        },
        "workspace automation github push dispatch failed",
      );
    }
  }

  return results;
}

export async function dispatchWorkspaceAutomationForScheduleAndAdvance(input: {
  automation: WorkspaceAutomationRecord;
  repository: {
    id: string;
    githubInstallationId: string;
    githubRepositoryId: string;
  };
  scheduledRunAt: Date;
  completedAt?: Date;
}) {
  const result = await dispatchWorkspaceAutomationForSchedule(input);
  await advanceWorkspaceAutomationNextRun({
    automationId: input.automation.id,
    organizationId: input.automation.organizationId,
    completedAt: input.completedAt,
  });
  return result;
}
