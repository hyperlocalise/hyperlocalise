import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import {
  buildGithubPushAutomationIdempotencyKey,
  buildGithubScheduledAutomationIdempotencyKey,
} from "@/lib/agents/github/github-repository-automation-idempotency";
import { buildGithubRepoAutomationDispatchPayload } from "@/lib/agents/github/github-repository-automation-settings";
import {
  claimGithubRepositoryAutomationJob,
  getGithubRepositoryAutomationJobById,
  type GithubRepositoryAutomationJobStatus,
} from "@/lib/agents/github/github-repository-automation-jobs";
import { enqueueGithubRepositoryAutomationJob } from "@/lib/agents/github/github-repository-automation-worker";
import { githubRepositoryAutomationJobHasRunnableWorkflow } from "@/lib/agents/github/github-repository-automation-workflows";
import { workspaceAutomationToGithubSettings } from "@/lib/agents/workspace-automation-github-mapping";
import {
  buildWorkspaceGithubPushAutomationIdempotencyKey,
  buildWorkspaceManualAutomationIdempotencyKey,
  buildWorkspaceScheduledAutomationIdempotencyKey,
} from "@/lib/agents/workspace-automation-idempotency";
import { updateWorkspaceAutomationRun } from "@/lib/agents/workspace-automations";
import {
  WORKSPACE_GITHUB_JOB_POLL_INTERVAL_MS,
  WORKSPACE_GITHUB_JOB_POLL_MAX_MS,
} from "@/lib/agent-runtime/subagents/constants";

import type { WorkspaceOrchestratorSession } from "../context";

function isTerminalGithubJobStatus(status: GithubRepositoryAutomationJobStatus) {
  return status === "succeeded" || status === "failed" || status === "skipped";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGithubJobTerminal(jobId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < WORKSPACE_GITHUB_JOB_POLL_MAX_MS) {
    const job = await getGithubRepositoryAutomationJobById(jobId);
    if (!job) {
      throw new Error("github_repository_automation_job_not_found");
    }

    if (isTerminalGithubJobStatus(job.status)) {
      return job;
    }

    await sleep(WORKSPACE_GITHUB_JOB_POLL_INTERVAL_MS);
  }

  throw new Error("github_repository_automation_job_poll_timeout");
}

function resolveGithubIdempotencyKey(input: {
  session: WorkspaceOrchestratorSession;
  configVersion: number;
  repositoryId: string;
  githubRepositoryId: string;
}) {
  const snapshot = input.session.run.inputSnapshot;
  const triggerSource = input.session.run.triggerSource;

  if (triggerSource === "manual") {
    const manualKey =
      typeof snapshot.manualIdempotencyKey === "string"
        ? snapshot.manualIdempotencyKey
        : input.session.run.id;
    return buildWorkspaceManualAutomationIdempotencyKey({
      automationId: input.session.automation.id,
      configVersion: input.configVersion,
      idempotencyKey: manualKey,
    });
  }

  if (triggerSource === "scheduled") {
    const scheduledRunAt =
      typeof snapshot.scheduledRunAt === "string" ? new Date(snapshot.scheduledRunAt) : new Date();
    return buildGithubScheduledAutomationIdempotencyKey({
      githubInstallationRepositoryId: input.repositoryId,
      configVersion: input.configVersion,
      scheduledRunAt,
    });
  }

  if (triggerSource === "github") {
    const pushBranch = typeof snapshot.pushBranch === "string" ? snapshot.pushBranch : null;
    const commitAfter = typeof snapshot.commitAfter === "string" ? snapshot.commitAfter : null;
    const commitBefore = typeof snapshot.commitBefore === "string" ? snapshot.commitBefore : "";
    const githubDeliveryId =
      typeof snapshot.githubDeliveryId === "string"
        ? snapshot.githubDeliveryId
        : input.session.run.id;

    if (pushBranch && commitAfter) {
      return buildGithubPushAutomationIdempotencyKey({
        organizationId: input.session.organizationId,
        githubInstallationRepositoryId: input.repositoryId,
        githubRepositoryId: input.githubRepositoryId,
        branch: pushBranch,
        commitBefore,
        commitAfter,
        configVersion: input.configVersion,
      });
    }

    return buildWorkspaceGithubPushAutomationIdempotencyKey({
      automationId: input.session.automation.id,
      configVersion: input.configVersion,
      githubDeliveryId,
    });
  }

  return buildWorkspaceScheduledAutomationIdempotencyKey({
    automationId: input.session.automation.id,
    configVersion: input.configVersion,
    scheduledRunAt: new Date(),
  });
}

export function createRunGithubWorkflowsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Run enabled GitHub repository automation workflows (push source, pull translations, validation) for this automation.",
    inputSchema: z.object({
      summary: z
        .string()
        .optional()
        .describe("Optional operator note to include in the run record."),
    }),
    execute: async () => {
      if (!session.repository) {
        throw new Error("github_repository_target_required");
      }

      const githubSettings = workspaceAutomationToGithubSettings(session.automation);
      if (!githubSettings) {
        throw new Error("github_workflows_not_configured");
      }

      const snapshot = session.run.inputSnapshot;
      const pushBranch = typeof snapshot.pushBranch === "string" ? snapshot.pushBranch : undefined;
      const dispatchPayload = buildGithubRepoAutomationDispatchPayload({
        configVersion: session.automation.configVersion,
        githubInstallationRepositoryId: session.repository.id,
        organizationId: session.organizationId,
        githubRepositoryId: session.repository.githubRepositoryId,
        githubInstallationId: session.repository.githubInstallationId,
        settings: githubSettings,
        pushBranch,
      });

      if (!dispatchPayload) {
        throw new Error("github_dispatch_payload_missing");
      }

      const scheduledRunAt =
        typeof snapshot.scheduledRunAt === "string" ? new Date(snapshot.scheduledRunAt) : null;

      const claim = await claimGithubRepositoryAutomationJob({
        idempotencyKey: resolveGithubIdempotencyKey({
          session,
          configVersion: dispatchPayload.configVersion,
          repositoryId: session.repository.id,
          githubRepositoryId: session.repository.githubRepositoryId,
        }),
        organizationId: session.organizationId,
        githubInstallationRepositoryId: session.repository.id,
        githubInstallationId: session.repository.githubInstallationId,
        githubRepositoryId: session.repository.githubRepositoryId,
        configVersion: dispatchPayload.configVersion,
        triggerMode: session.run.triggerSource === "github" ? "push" : "scheduled",
        triggerBranch: pushBranch ?? null,
        commitBefore: typeof snapshot.commitBefore === "string" ? snapshot.commitBefore : null,
        commitAfter: typeof snapshot.commitAfter === "string" ? snapshot.commitAfter : null,
        workflows: dispatchPayload.workflows,
        githubDeliveryId:
          typeof snapshot.githubDeliveryId === "string" ? snapshot.githubDeliveryId : null,
        scheduledRunAt,
      });

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        githubRepositoryAutomationJobId: claim.job.id,
        status: claim.job.status === "skipped" ? "skipped" : "running",
        startedAt: claim.job.status === "skipped" ? null : new Date(),
        completedAt: claim.job.status === "skipped" ? new Date() : null,
        outputSummary:
          claim.job.status === "skipped"
            ? { skipReason: claim.job.skipReason ?? "automation_skipped" }
            : {},
      });

      if (claim.job.status === "skipped") {
        session.terminalStatus = "skipped";
        const result = {
          jobId: claim.job.id,
          status: claim.job.status,
          skipReason: claim.job.skipReason,
        };
        session.stepResults.run_github_workflows = result;
        return result;
      }

      if (
        githubRepositoryAutomationJobHasRunnableWorkflow(dispatchPayload.workflows) &&
        claim.job.status === "queued"
      ) {
        await enqueueGithubRepositoryAutomationJob({ jobId: claim.job.id });
      }

      const terminalJob = await waitForGithubJobTerminal(claim.job.id);
      const mappedStatus =
        terminalJob.status === "succeeded"
          ? "succeeded"
          : terminalJob.status === "failed"
            ? "failed"
            : "skipped";

      session.terminalStatus = mappedStatus;
      if (terminalJob.lastError) {
        session.terminalError = terminalJob.lastError;
      }

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        status: mappedStatus,
        outputSummary: {
          ...terminalJob.resultSummary,
          ...(terminalJob.skipReason ? { skipReason: terminalJob.skipReason } : {}),
          githubRepositoryAutomationJobId: terminalJob.id,
        },
        error: terminalJob.lastError ? { message: terminalJob.lastError } : null,
        completedAt: new Date(),
      });

      const result = {
        jobId: terminalJob.id,
        status: terminalJob.status,
        skipReason: terminalJob.skipReason,
        resultSummary: terminalJob.resultSummary,
      };
      session.stepResults.run_github_workflows = result;
      return result;
    },
  });
}
