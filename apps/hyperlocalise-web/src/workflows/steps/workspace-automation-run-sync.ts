/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { GithubRepositoryAutomationJobStatus } from "@/lib/agents/github/github-repository-automation-jobs";

export async function syncWorkspaceAutomationRunsForGithubJobStep(input: {
  jobId: string;
  status: GithubRepositoryAutomationJobStatus;
  resultSummary?: Record<string, unknown> | null;
  lastError?: string | null;
  skipReason?: string | null;
  completedAt?: Date | null;
}): Promise<void> {
  "use step";

  const { syncWorkspaceAutomationRunsForGithubJob } =
    await import("@/lib/agents/workspace-automation-run-sync");
  await syncWorkspaceAutomationRunsForGithubJob(input);
}
