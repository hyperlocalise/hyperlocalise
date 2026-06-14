import type { GithubRepositoryAutomationJobWithRepository } from "@/lib/agents/github/github-repository-automation-jobs";
import type { GithubRepositoryAutomationCommitRange } from "@/lib/agents/github/github-repository-automation-commit-range";

export function shouldPublishGithubAutomationCheckRun(
  job: GithubRepositoryAutomationJobWithRepository,
): boolean {
  return job.workflows.statusCheck.enabled;
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
  createGithubRepositoryAutomationCheckRun: (input: {
    installationId: string;
    repositoryFullName: string;
    headSha: string;
    organizationSlug: string | null;
    githubRepositoryId: string;
    jobId: string;
  }) => Promise<string | null>;
  updateGithubRepositoryAutomationJobStatus: (input: {
    jobId: string;
    status: "running";
    githubCheckRunId: string;
  }) => Promise<void>;
}): Promise<string | null> {
  if (!shouldPublishGithubAutomationCheckRun(input.job)) {
    return null;
  }

  if (input.job.githubCheckRunId) {
    return input.job.githubCheckRunId;
  }

  const checkRunId = await input.createGithubRepositoryAutomationCheckRun({
    installationId: input.job.githubInstallationId,
    repositoryFullName: input.job.repositoryFullName,
    headSha: input.headSha,
    organizationSlug: input.job.organizationSlug,
    githubRepositoryId: input.job.githubRepositoryId,
    jobId: input.job.id,
  });

  if (checkRunId) {
    await input.updateGithubRepositoryAutomationJobStatus({
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
  getGithubRepositoryAutomationJobById: (
    jobId: string,
  ) => Promise<GithubRepositoryAutomationJobWithRepository | null>;
  completeGithubRepositoryAutomationCheckRun: (input: {
    installationId: string;
    repositoryFullName: string;
    checkRunId: string;
    conclusion: "success" | "failure" | "neutral" | "skipped";
    summary: string;
    organizationSlug: string | null;
    githubRepositoryId: string;
    jobId: string;
  }) => Promise<void>;
  resolveGithubAutomationCheckConclusion: (input: {
    statusCheckMode: "advisory" | "blocking";
    status: "succeeded" | "failed" | "skipped";
  }) => "success" | "failure" | "neutral" | "skipped";
}): Promise<void> {
  if (!input.checkRunId) {
    return;
  }

  const job = await input.getGithubRepositoryAutomationJobById(input.jobId);
  if (!job || !shouldPublishGithubAutomationCheckRun(job)) {
    return;
  }

  const status = input.terminalStatus ?? job.status;
  if (status !== "succeeded" && status !== "failed" && status !== "skipped") {
    return;
  }

  await input.completeGithubRepositoryAutomationCheckRun({
    installationId: job.githubInstallationId,
    repositoryFullName: job.repositoryFullName,
    checkRunId: input.checkRunId,
    conclusion: input.resolveGithubAutomationCheckConclusion({
      statusCheckMode: job.workflows.statusCheck.mode,
      status,
    }),
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

export async function loadGithubRepositoryAutomationJobStep(jobId: string) {
  "use step";

  const { getGithubRepositoryAutomationJobById } =
    await import("@/lib/agents/github/github-repository-automation-jobs");
  const job = await getGithubRepositoryAutomationJobById(jobId);
  if (!job) {
    throw new Error("github_repository_automation_job_not_found");
  }

  return job;
}

export async function claimGithubRepositoryAutomationJobStep(input: {
  jobId: string;
  workflowRunId: string;
}) {
  "use step";

  const { claimGithubRepositoryAutomationJobForRunning, getGithubRepositoryAutomationJobById } =
    await import("@/lib/agents/github/github-repository-automation-jobs");
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

export async function reattachGithubRepositoryAutomationWorkflowRunStep(input: {
  jobId: string;
  workflowRunId: string;
}) {
  "use step";

  const { updateGithubRepositoryAutomationJobStatus } =
    await import("@/lib/agents/github/github-repository-automation-jobs");
  await updateGithubRepositoryAutomationJobStatus({
    jobId: input.jobId,
    status: "running",
    workflowRunId: input.workflowRunId,
  });
}

export async function runGithubRepositoryAutomationJobStep(input: {
  jobId: string;
  workflowRunId: string;
}) {
  "use step";

  const { isErr } = await import("@/lib/primitives/result/results");
  const { getGithubRepositoryAutomationJobById, updateGithubRepositoryAutomationJobStatus } =
    await import("@/lib/agents/github/github-repository-automation-jobs");
  const { resolveGithubRepositoryAutomationCommitRange } =
    await import("@/lib/agents/github/github-repository-automation-commit-range");
  const {
    completeGithubRepositoryAutomationCheckRun,
    createGithubRepositoryAutomationCheckRun,
    resolveGithubAutomationCheckConclusion,
  } = await import("@/lib/agents/github/github-repository-automation-check-run");
  const { runGithubRepositoryAutomationPullTranslations } =
    await import("@/lib/agents/github/github-repository-automation-pull-translations");
  const { runGithubRepositoryAutomationPushSource } =
    await import("@/lib/agents/github/github-repository-automation-push-source");
  const { runGithubRepositoryAutomationValidation } =
    await import("@/lib/agents/github/github-repository-automation-validation");

  let job = await getGithubRepositoryAutomationJobById(input.jobId);
  if (!job) {
    throw new Error("github_repository_automation_job_not_found");
  }

  if (!job.workflows.pushSource && !job.workflows.validation && !job.workflows.pullTranslations) {
    const checkRunId = job.commitAfter
      ? await ensureGithubAutomationCheckRun({
          job,
          headSha: job.commitAfter,
          createGithubRepositoryAutomationCheckRun,
          updateGithubRepositoryAutomationJobStatus,
        })
      : null;
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "skipped",
      skipReason: "no_runnable_workflows",
    });
    await completeGithubAutomationCheckRunForJob({
      jobId: job.id,
      checkRunId,
      getGithubRepositoryAutomationJobById,
      completeGithubRepositoryAutomationCheckRun,
      resolveGithubAutomationCheckConclusion,
    });
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

    checkRunId = await ensureGithubAutomationCheckRun({
      job,
      headSha: commitRange.commitAfter,
      createGithubRepositoryAutomationCheckRun,
      updateGithubRepositoryAutomationJobStatus,
    });
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
    } else {
      await completeGithubAutomationCheckRunForJob({
        jobId: job.id,
        checkRunId,
        terminalStatus: "succeeded",
        getGithubRepositoryAutomationJobById,
        completeGithubRepositoryAutomationCheckRun,
        resolveGithubAutomationCheckConclusion,
      });
    }

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeGithubAutomationCheckRunForJob({
      jobId: job.id,
      checkRunId,
      terminalStatus: "failed",
      lastError: message,
      getGithubRepositoryAutomationJobById,
      completeGithubRepositoryAutomationCheckRun,
      resolveGithubAutomationCheckConclusion,
    }).catch(() => undefined);
    throw error;
  }
}
