import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import type { GithubRepositoryAutomationJobStatus } from "./github/github-repository-automation-jobs";
import { notifyWorkspaceAutomationTerminalRun } from "./workspace-automation-notifications";
import {
  getWorkspaceAutomationById,
  updateWorkspaceAutomationRun,
  type WorkspaceAutomationRunStatus,
} from "./workspace-automations";

function mapGithubJobStatusToRunStatus(
  status: GithubRepositoryAutomationJobStatus,
): WorkspaceAutomationRunStatus | null {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    default:
      return null;
  }
}

export async function syncWorkspaceAutomationRunsForGithubJob(input: {
  jobId: string;
  status: GithubRepositoryAutomationJobStatus;
  resultSummary?: Record<string, unknown> | null;
  lastError?: string | null;
  skipReason?: string | null;
  completedAt?: Date | null;
}) {
  const [runRow] = await db
    .select()
    .from(schema.workspaceAutomationRuns)
    .where(eq(schema.workspaceAutomationRuns.githubRepositoryAutomationJobId, input.jobId))
    .limit(1);

  if (!runRow) {
    return;
  }

  const mappedStatus = mapGithubJobStatusToRunStatus(input.status);
  if (!mappedStatus) {
    return;
  }

  const outputSummary = {
    ...(runRow.outputSummary as Record<string, unknown>),
    ...input.resultSummary,
    ...(input.skipReason ? { skipReason: input.skipReason } : {}),
  };

  const updatedRun = await updateWorkspaceAutomationRun({
    runId: runRow.id,
    organizationId: runRow.organizationId,
    status: mappedStatus,
    outputSummary,
    error: input.lastError ? { message: input.lastError } : null,
    completedAt:
      input.completedAt ??
      (mappedStatus === "succeeded" || mappedStatus === "failed" || mappedStatus === "skipped"
        ? new Date()
        : null),
    startedAt:
      mappedStatus === "running" && !runRow.startedAt
        ? new Date()
        : (runRow.startedAt ?? undefined),
  });

  if (!updatedRun) {
    return;
  }

  const automation = await getWorkspaceAutomationById({
    automationId: runRow.automationId,
    organizationId: runRow.organizationId,
  });
  if (!automation) {
    return;
  }

  const notificationSummary = await notifyWorkspaceAutomationTerminalRun({
    automation,
    run: updatedRun,
  });

  if (Object.keys(notificationSummary).length > 0) {
    await updateWorkspaceAutomationRun({
      runId: updatedRun.id,
      organizationId: updatedRun.organizationId,
      outputSummary: {
        ...updatedRun.outputSummary,
        ...notificationSummary,
      },
    });
  }
}
