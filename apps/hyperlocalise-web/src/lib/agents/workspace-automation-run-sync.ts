/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import type { GithubRepositoryAutomationJobStatus } from "./github/github-repository-automation-jobs";
import {
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

function isTerminalRunStatus(status: WorkspaceAutomationRunStatus) {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled" || status === "skipped"
  );
}

export async function syncWorkspaceAutomationRunsForGithubJob(input: {
  jobId: string;
  status: GithubRepositoryAutomationJobStatus;
  resultSummary?: Record<string, unknown> | null;
  lastError?: string | null;
  skipReason?: string | null;
  completedAt?: Date | null;
}) {
  const mappedStatus = mapGithubJobStatusToRunStatus(input.status);
  if (!mappedStatus) {
    return;
  }

  const runRows = await db
    .select()
    .from(schema.workspaceAutomationRuns)
    .where(eq(schema.workspaceAutomationRuns.githubRepositoryAutomationJobId, input.jobId));

  if (runRows.length === 0) {
    return;
  }

  for (const runRow of runRows) {
    const outputSummary = {
      ...(runRow.outputSummary as Record<string, unknown>),
      ...input.resultSummary,
      ...(input.skipReason ? { skipReason: input.skipReason } : {}),
    };

    const orchestratorManaged =
      typeof (runRow.outputSummary as Record<string, unknown>).orchestratorEnqueuedAt === "string";

    if (orchestratorManaged && isTerminalRunStatus(mappedStatus)) {
      continue;
    }

    await updateWorkspaceAutomationRun({
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
  }
}
