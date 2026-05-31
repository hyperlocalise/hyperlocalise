import { createLogger } from "@/lib/log";
import { uploadRepositorySourceFilesFromSandbox } from "@/lib/file-storage/upload-repository-source-files";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import {
  resolveGithubRepositoryAutomationCommitRange,
  type GithubRepositoryAutomationCommitRange,
} from "./github-repository-automation-commit-range";
import {
  buildCommitRangeLogArgs,
  buildCommitScopedNameStatusDiffArgs,
  parseCommitLogLines,
  parseNameStatusDiffPathsForUpload,
  shouldSkipCommitForSourcePaths,
} from "./github-repository-automation-commits";
import { discoverI18nConfigInSandbox } from "./github-repository-automation-i18n-config";
import type { GithubRepositoryAutomationJobWithRepository } from "./github-repository-automation-jobs";
import { updateGithubRepositoryAutomationJobStatus } from "./github-repository-automation-jobs";
import {
  type GithubRepositoryAutomationPushSourceError,
  persistPushSourceFailedJob,
  persistPushSourceSkippedJob,
} from "./github-repository-automation-push-source.errors";
import { resolveGithubRepositoryAutomationProjectId } from "./github-repository-automation-project";
import { getGithubRepositoryAutomationSettings } from "./github-repository-automation-settings-store";
import {
  createGithubRepositoryAutomationSandbox,
  runGitDiffInSandbox,
  runGitLogInSandbox,
  stopGithubRepositoryAutomationSandbox,
} from "./github-repository-automation-sandbox";

const logger = createLogger("github-repo-automation-push-source");

export type { GithubRepositoryAutomationPushSourceError } from "./github-repository-automation-push-source.errors";
export type { GithubRepositoryAutomationPushSourceSummary } from "./github-repository-automation-push-source.types";
import type { GithubRepositoryAutomationPushSourceSummary } from "./github-repository-automation-push-source.types";

function summarizePushSourceResults(
  fileResults: Awaited<ReturnType<typeof uploadRepositorySourceFilesFromSandbox>>,
): GithubRepositoryAutomationPushSourceSummary["counts"] {
  const counts = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
    unchanged: 0,
  };

  for (const result of fileResults) {
    if (result.outcome === "uploaded") {
      counts.uploaded += 1;
      continue;
    }

    if (result.outcome === "failed") {
      counts.failed += 1;
      continue;
    }

    if (result.reason === "unchanged_for_commit") {
      counts.unchanged += 1;
      continue;
    }

    counts.skipped += 1;
  }

  return counts;
}

function buildPushSourceSummary(input: {
  totalCommits: number;
  fileResults: Awaited<ReturnType<typeof uploadRepositorySourceFilesFromSandbox>>;
}): GithubRepositoryAutomationPushSourceSummary {
  return {
    totalCommits: input.totalCommits,
    counts: summarizePushSourceResults(input.fileResults),
  };
}

async function returnPushSourceSkipped(
  jobId: string,
  error: GithubRepositoryAutomationPushSourceError,
): Promise<Result<never, GithubRepositoryAutomationPushSourceError>> {
  await persistPushSourceSkippedJob({ jobId, error });
  return err(error);
}

async function returnPushSourceFailed(
  jobId: string,
  error: GithubRepositoryAutomationPushSourceError,
  lastError?: string | null,
): Promise<Result<never, GithubRepositoryAutomationPushSourceError>> {
  await persistPushSourceFailedJob({ jobId, error, lastError });
  return err(error);
}

export async function runGithubRepositoryAutomationPushSource(input: {
  job: GithubRepositoryAutomationJobWithRepository;
  workflowRunId?: string | null;
  commitRange?: GithubRepositoryAutomationCommitRange;
}): Promise<
  Result<GithubRepositoryAutomationPushSourceSummary, GithubRepositoryAutomationPushSourceError>
> {
  const job = input.job;

  if (!job.workflows.pushSource) {
    return returnPushSourceSkipped(job.id, { code: "push_source_workflow_disabled" });
  }

  const settingsRecord = await getGithubRepositoryAutomationSettings({
    githubInstallationRepositoryId: job.githubInstallationRepositoryId,
    githubRepositoryId: job.githubRepositoryId,
  });

  const projectId = await resolveGithubRepositoryAutomationProjectId({
    organizationId: job.organizationId,
    repositoryFullName: job.repositoryFullName,
    configuredProjectId: settingsRecord.settings.workflows.pushSource.projectId,
  });

  if (!projectId) {
    return returnPushSourceSkipped(job.id, { code: "project_not_linked" });
  }

  const commitRangeResult: Result<
    GithubRepositoryAutomationCommitRange,
    GithubRepositoryAutomationPushSourceError
  > = input.commitRange ? ok(input.commitRange) : await resolveCommitRangeForPushSource(job);

  if (isErr(commitRangeResult)) {
    return returnPushSourceFailed(job.id, commitRangeResult.error);
  }

  const { commitBefore, commitAfter } = commitRangeResult.value;

  if (!input.commitRange && !job.commitAfter) {
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "running",
      commitBefore,
      commitAfter,
    });
  }

  let sandboxId: string | null = null;

  try {
    sandboxId = await createGithubRepositoryAutomationSandbox({
      installationId: job.githubInstallationId,
      repositoryFullName: job.repositoryFullName,
      revision: commitAfter,
      cloneDepth: 50,
    });

    const i18nConfig = await discoverI18nConfigInSandbox(sandboxId);
    if (!i18nConfig) {
      return returnPushSourceSkipped(job.id, { code: "i18n_config_not_found" });
    }

    if (i18nConfig.patterns.sourcePatterns.length === 0) {
      return returnPushSourceSkipped(job.id, { code: "source_patterns_not_configured" });
    }

    const logArgs = buildCommitRangeLogArgs({ commitBefore, commitAfter });
    const logResult = await runGitLogInSandbox(sandboxId, logArgs);
    if (logResult.exitCode !== 0) {
      return returnPushSourceFailed(job.id, { code: "failed_to_list_commits" });
    }

    const commits = parseCommitLogLines(logResult.output);
    const pathsToUpload = new Set<string>();

    for (const commit of commits) {
      const nameStatusDiff = await runGitDiffInSandbox(
        sandboxId,
        buildCommitScopedNameStatusDiffArgs({
          parentSha: commit.parentSha,
          commitSha: commit.sha,
          paths: i18nConfig.patterns.sourcePatterns,
        }),
      );

      const changedPaths = parseNameStatusDiffPathsForUpload(
        nameStatusDiff.exitCode === 0 ? nameStatusDiff.output : "",
      );
      const skipDecision = shouldSkipCommitForSourcePaths({
        changedPaths,
        patterns: i18nConfig.patterns,
      });

      if (skipDecision.skipped) {
        continue;
      }

      for (const path of skipDecision.paths) {
        pathsToUpload.add(path);
      }
    }

    if (pathsToUpload.size === 0) {
      const summary = buildPushSourceSummary({
        totalCommits: commits.length,
        fileResults: [],
      });

      return returnPushSourceSkipped(job.id, {
        code: "no_relevant_source_file_changes",
        summary,
      });
    }

    const fileResults = await uploadRepositorySourceFilesFromSandbox({
      sandboxId,
      organizationId: job.organizationId,
      projectId,
      paths: [...pathsToUpload],
      commitSha: commitAfter,
      workflowRunId: input.workflowRunId ?? job.workflowRunId,
      uploadSurface: "github_automation",
    });

    const summary = buildPushSourceSummary({
      totalCommits: commits.length,
      fileResults,
    });

    if (summary.counts.failed > 0) {
      return returnPushSourceFailed(job.id, { code: "push_source_failed", summary });
    }

    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "succeeded",
      resultSummary: summary,
      lastError: null,
    });

    logger.info(
      {
        jobId: job.id,
        counts: summary.counts,
      },
      "github repository automation push source completed",
    );

    return ok(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "push_source_automation_failed";

    logger.error(
      {
        jobId: job.id,
        err: error,
      },
      "github repository automation push source failed",
    );

    return returnPushSourceFailed(job.id, { code: "infrastructure", message }, message);
  } finally {
    if (sandboxId) {
      await stopGithubRepositoryAutomationSandbox(sandboxId).catch(() => undefined);
    }
  }
}

async function resolveCommitRangeForPushSource(
  job: GithubRepositoryAutomationJobWithRepository,
): Promise<
  Result<GithubRepositoryAutomationCommitRange, GithubRepositoryAutomationPushSourceError>
> {
  try {
    const commitRange = await resolveGithubRepositoryAutomationCommitRange(job);
    return ok(commitRange);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed_to_resolve_commit_range_for_push_source";

    return err({ code: "infrastructure", message });
  }
}
