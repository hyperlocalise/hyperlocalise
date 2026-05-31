import { getWorkflowMetadata } from "workflow";

import type { GithubRepositoryAutomationWorkflowInput } from "@/lib/agents/github/github-repository-automation-task";
import {
  claimGithubRepositoryAutomationJobForRunning,
  getGithubRepositoryAutomationJobById,
  updateGithubRepositoryAutomationJobStatus,
} from "@/lib/agents/github/github-repository-automation-jobs";
import {
  resolveGithubRepositoryAutomationCommitRange,
  type GithubRepositoryAutomationCommitRange,
} from "@/lib/agents/github/github-repository-automation-commit-range";
import { runGithubRepositoryAutomationPushSource } from "@/lib/agents/github/github-repository-automation-push-source";
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

async function runAutomationJobStep(input: { jobId: string; workflowRunId: string }) {
  "use step";

  let job = await getGithubRepositoryAutomationJobById(input.jobId);
  if (!job) {
    throw new Error("github_repository_automation_job_not_found");
  }

  const results: Record<string, unknown> = {};
  const needsCommitRange = job.workflows.pushSource || job.workflows.validation;
  let commitRange: GithubRepositoryAutomationCommitRange | undefined;

  if (needsCommitRange) {
    if (job.commitAfter) {
      commitRange = {
        commitBefore: job.commitBefore,
        commitAfter: job.commitAfter,
      };
    } else {
      commitRange = await resolveGithubRepositoryAutomationCommitRange(job);
      await updateGithubRepositoryAutomationJobStatus({
        jobId: job.id,
        status: "running",
        commitBefore: commitRange.commitBefore,
        commitAfter: commitRange.commitAfter,
      });
      job = {
        ...job,
        commitBefore: commitRange.commitBefore,
        commitAfter: commitRange.commitAfter,
      };
    }
  }

  if (job.workflows.pushSource) {
    results.pushSource = await runGithubRepositoryAutomationPushSource({
      job,
      workflowRunId: input.workflowRunId,
      commitRange,
    });
  }

  if (job.workflows.validation) {
    results.validation = await runGithubRepositoryAutomationValidation({
      job,
      workflowRunId: input.workflowRunId,
      commitRange,
    });
  }

  if (!job.workflows.pushSource && !job.workflows.validation && !job.workflows.pullTranslations) {
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "skipped",
      skipReason: "no_runnable_workflows",
    });
    return { skipped: true, reason: "no_runnable_workflows" };
  }

  if (!job.workflows.pushSource && !job.workflows.validation) {
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "skipped",
      skipReason: "pull_translations_not_implemented",
    });
    return { skipped: true, reason: "pull_translations_not_implemented" };
  }

  return results;
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

  return runAutomationJobStep({ jobId: event.jobId, workflowRunId });
}
