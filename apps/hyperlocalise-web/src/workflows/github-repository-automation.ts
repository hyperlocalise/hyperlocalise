import { getWorkflowMetadata } from "workflow";

import type { GithubRepositoryAutomationWorkflowInput } from "@/lib/agents/github/github-repository-automation-task";
import {
  claimGithubRepositoryAutomationJobForRunning,
  getGithubRepositoryAutomationJobById,
  updateGithubRepositoryAutomationJobStatus,
  type GithubRepositoryAutomationJobWithRepository,
} from "@/lib/agents/github/github-repository-automation-jobs";
import {
  resolveGithubRepositoryAutomationCommitRange,
  type GithubRepositoryAutomationCommitRange,
} from "@/lib/agents/github/github-repository-automation-commit-range";
import { isErr } from "@/lib/primitives/result/results";

import {
  completeGithubRepositoryAutomationCheckRun,
  createGithubRepositoryAutomationCheckRun,
  type GithubRepositoryAutomationCheckConclusion,
} from "@/lib/agents/github/github-repository-automation-check-run";
import { runGithubRepositoryAutomationPullTranslations } from "@/lib/agents/github/github-repository-automation-pull-translations";
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

export function shouldPublishGithubAutomationCheckRun(
  job: GithubRepositoryAutomationJobWithRepository,
): boolean {
  return job.workflows.statusCheck.enabled;
}

export function resolveGithubAutomationCheckConclusion(input: {
  job: GithubRepositoryAutomationJobWithRepository;
  status: "succeeded" | "failed" | "skipped";
}): GithubRepositoryAutomationCheckConclusion {
  if (input.status === "succeeded") {
    return "success";
  }

  if (input.status === "skipped") {
    return "skipped";
  }

  return input.job.workflows.statusCheck.mode === "advisory" ? "neutral" : "failure";
}

function buildGithubAutomationCheckSummary(input: {
  status: "succeeded" | "failed" | "skipped";
  skipReason?: string | null;
  lastError?: string | null;
  resultSummary?: Record<string, unknown> | null;
}): string {
  if (input.status === "skipped") {
    return `Hyperlocalise automation was skipped: ${input.skipReason ?? "skipped"}.`;
  }

  if (input.status === "failed") {
    return `Hyperlocalise automation failed: ${input.lastError ?? "automation_failed"}.`;
  }

  const resultSummary = input.resultSummary
    ? ` Result summary: ${JSON.stringify(input.resultSummary)}.`
    : "";
  return `Hyperlocalise automation completed successfully.${resultSummary}`;
}

async function ensureGithubAutomationCheckRun(input: {
  job: GithubRepositoryAutomationJobWithRepository;
  headSha: string;
}): Promise<string | null> {
  if (!shouldPublishGithubAutomationCheckRun(input.job)) {
    return null;
  }

  if (input.job.githubCheckRunId) {
    return input.job.githubCheckRunId;
  }

  const checkRunId = await createGithubRepositoryAutomationCheckRun({
    installationId: input.job.githubInstallationId,
    repositoryFullName: input.job.repositoryFullName,
    headSha: input.headSha,
    organizationSlug: input.job.organizationSlug,
    githubRepositoryId: input.job.githubRepositoryId,
    jobId: input.job.id,
  });

  if (checkRunId) {
    await updateGithubRepositoryAutomationJobStatus({
      jobId: input.job.id,
      status: "running",
      githubCheckRunId: checkRunId,
    });
  }

  return checkRunId;
}

async function completeGithubAutomationCheckRunForJob(input: {
  jobId: string;
  checkRunId: string | null;
  terminalStatus?: "succeeded" | "failed" | "skipped";
  lastError?: string | null;
}): Promise<void> {
  if (!input.checkRunId) {
    return;
  }

  const job = await getGithubRepositoryAutomationJobById(input.jobId);
  if (!job || !shouldPublishGithubAutomationCheckRun(job)) {
    return;
  }

  const status = input.terminalStatus ?? job.status;
  if (status !== "succeeded" && status !== "failed" && status !== "skipped") {
    return;
  }

  await completeGithubRepositoryAutomationCheckRun({
    installationId: job.githubInstallationId,
    repositoryFullName: job.repositoryFullName,
    checkRunId: input.checkRunId,
    conclusion: resolveGithubAutomationCheckConclusion({ job, status }),
    summary: buildGithubAutomationCheckSummary({
      status,
      skipReason: job.skipReason,
      lastError: input.lastError ?? job.lastError,
      resultSummary: job.resultSummary,
    }),
    organizationSlug: job.organizationSlug,
    githubRepositoryId: job.githubRepositoryId,
    jobId: job.id,
  });
}

async function runAutomationJobStep(input: { jobId: string; workflowRunId: string }) {
  "use step";

  let job = await getGithubRepositoryAutomationJobById(input.jobId);
  if (!job) {
    throw new Error("github_repository_automation_job_not_found");
  }

  if (!job.workflows.pushSource && !job.workflows.validation && !job.workflows.pullTranslations) {
    const checkRunId = job.commitAfter
      ? await ensureGithubAutomationCheckRun({ job, headSha: job.commitAfter })
      : null;
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "skipped",
      skipReason: "no_runnable_workflows",
    });
    await completeGithubAutomationCheckRunForJob({ jobId: job.id, checkRunId });
    return { skipped: true, reason: "no_runnable_workflows" };
  }

  const results: Record<string, unknown> = {};
  const needsCommitRange =
    job.workflows.pushSource || job.workflows.validation || job.workflows.pullTranslations;
  let commitRange: GithubRepositoryAutomationCommitRange | undefined;

  let checkRunId: string | null = job.githubCheckRunId;

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

    checkRunId = await ensureGithubAutomationCheckRun({ job, headSha: commitRange.commitAfter });
    if (checkRunId) {
      job = { ...job, githubCheckRunId: checkRunId };
    }
  }

  try {
    if (job.workflows.pushSource) {
      const pushSourceResult = await runGithubRepositoryAutomationPushSource({
        job,
        workflowRunId: input.workflowRunId,
        commitRange,
      });

      if (isErr(pushSourceResult)) {
        results.pushSource = pushSourceResult.error;
        if (pushSourceResult.error.code === "infrastructure") {
          throw new Error(pushSourceResult.error.message);
        }
      } else {
        results.pushSource = pushSourceResult.value;
      }
    }

    if (job.workflows.pullTranslations) {
      const pullTranslationsResult = await runGithubRepositoryAutomationPullTranslations({
        job,
        commitRange,
      });

      if (isErr(pullTranslationsResult)) {
        results.pullTranslations = pullTranslationsResult.error;
        if (pullTranslationsResult.error.code === "infrastructure") {
          throw new Error(pullTranslationsResult.error.message);
        }
      } else {
        results.pullTranslations = pullTranslationsResult.value;
      }
    }

    if (job.workflows.validation) {
      results.validation = await runGithubRepositoryAutomationValidation({
        job,
        workflowRunId: input.workflowRunId,
        commitRange,
      });
    }

    await completeGithubAutomationCheckRunForJob({ jobId: job.id, checkRunId });

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeGithubAutomationCheckRunForJob({
      jobId: job.id,
      checkRunId,
      terminalStatus: "failed",
      lastError: message,
    }).catch(() => undefined);
    throw error;
  }
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
