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
