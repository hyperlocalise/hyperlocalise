import { getWorkflowMetadata } from "workflow";

import type { GithubRepositoryAutomationWorkflowInput } from "@/lib/agents/github/github-repository-automation-task";
import type { GithubRepositoryAutomationJobWithRepository } from "@/lib/agents/github/github-repository-automation-jobs";

import {
  claimGithubRepositoryAutomationJobStep,
  loadGithubRepositoryAutomationJobStep,
  reattachGithubRepositoryAutomationWorkflowRunStep,
  runGithubRepositoryAutomationJobStep,
  shouldPublishGithubAutomationCheckRun,
} from "./steps/github-repository-automation";

export { shouldPublishGithubAutomationCheckRun };

export function resolveGithubAutomationCheckConclusion(input: {
  job: GithubRepositoryAutomationJobWithRepository;
  status: "succeeded" | "failed" | "skipped";
}) {
  if (input.status === "succeeded") {
    return "success";
  }

  if (input.status === "skipped") {
    return "skipped";
  }

  return input.job.workflows.statusCheck.mode === "advisory" ? "neutral" : "failure";
}

export async function githubRepositoryAutomationWorkflow(
  event: GithubRepositoryAutomationWorkflowInput,
): Promise<Record<string, unknown>> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const job = await loadGithubRepositoryAutomationJobStep(event.jobId);

  if (job.status === "queued") {
    const claimedJob = await claimGithubRepositoryAutomationJobStep({
      jobId: event.jobId,
      workflowRunId,
    });
    if (claimedJob.workflowRunId !== workflowRunId) {
      return {
        skipped: true,
        reason: "job_claimed_by_another_workflow",
      };
    }
  } else if (job.status === "running" && !job.workflowRunId) {
    await reattachGithubRepositoryAutomationWorkflowRunStep({
      jobId: event.jobId,
      workflowRunId,
    });
  } else if (job.status === "running" && job.workflowRunId && job.workflowRunId !== workflowRunId) {
    return {
      skipped: true,
      reason: "job_claimed_by_another_workflow",
    };
  } else if (job.status === "succeeded" || job.status === "failed" || job.status === "skipped") {
    return {
      skipped: true,
      reason: "job_already_completed",
    };
  }

  return runGithubRepositoryAutomationJobStep({ jobId: event.jobId, workflowRunId });
}
