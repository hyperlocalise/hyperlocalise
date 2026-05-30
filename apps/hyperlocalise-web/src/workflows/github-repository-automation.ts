import { getWorkflowMetadata } from "workflow";

import type { GithubRepositoryAutomationWorkflowInput } from "@/lib/agents/github/github-repository-automation-task";
import {
  claimGithubRepositoryAutomationJobForRunning,
  getGithubRepositoryAutomationJobById,
  updateGithubRepositoryAutomationJobStatus,
} from "@/lib/agents/github/github-repository-automation-jobs";
import { runGithubRepositoryAutomationValidation } from "@/lib/agents/github/github-repository-automation-validation";

async function loadJobStep(jobId: string) {
  "use step";

  const job = await getGithubRepositoryAutomationJobById(jobId);
  if (!job) {
    throw new Error("github_repository_automation_job_not_found");
  }

  return job;
}

async function claimJobStep(input: { jobId: string; workflowRunId: string }) {
  "use step";

  const claimed = await claimGithubRepositoryAutomationJobForRunning({
    jobId: input.jobId,
    workflowRunId: input.workflowRunId,
  });

  if (!claimed) {
    const existing = await getGithubRepositoryAutomationJobById(input.jobId);
    if (!existing) {
      throw new Error("github_repository_automation_job_not_found");
    }
    return existing;
  }

  return claimed;
}

async function validateJobStep(input: { jobId: string; workflowRunId: string }) {
  "use step";

  const job = await getGithubRepositoryAutomationJobById(input.jobId);
  if (!job) {
    throw new Error("github_repository_automation_job_not_found");
  }

  return runGithubRepositoryAutomationValidation({
    job,
    workflowRunId: input.workflowRunId,
  });
}

export async function githubRepositoryAutomationWorkflow(
  event: GithubRepositoryAutomationWorkflowInput,
): Promise<Record<string, unknown>> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const job = await loadJobStep(event.jobId);

  if (job.status === "queued") {
    const claimedJob = await claimJobStep({ jobId: event.jobId, workflowRunId });
    if (claimedJob.workflowRunId !== workflowRunId) {
      return {
        skipped: true,
        reason: "job_claimed_by_another_workflow",
      };
    }
  } else if (job.status === "running" && !job.workflowRunId) {
    await updateGithubRepositoryAutomationJobStatus({
      jobId: event.jobId,
      status: "running",
      workflowRunId,
    });
  }

  return validateJobStep({ jobId: event.jobId, workflowRunId });
}
