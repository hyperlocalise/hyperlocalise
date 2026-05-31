import { createLogger } from "@/lib/log";
import { uploadRepositorySourceFilesFromSandbox } from "@/lib/file-storage/upload-repository-source-files";

import {
  resolveGithubRepositoryAutomationCommitRange,
  type GithubRepositoryAutomationCommitRange,
} from "./github-repository-automation-commit-range";
import {
  buildCommitRangeLogArgs,
  buildCommitScopedDiffArgs,
  parseCommitLogLines,
  parseNameOnlyDiffPaths,
  shouldSkipCommitForSourcePaths,
} from "./github-repository-automation-commits";
import { discoverI18nConfigInSandbox } from "./github-repository-automation-i18n-config";
import type { GithubRepositoryAutomationJobWithRepository } from "./github-repository-automation-jobs";
import { updateGithubRepositoryAutomationJobStatus } from "./github-repository-automation-jobs";
import { resolveGithubRepositoryAutomationProjectId } from "./github-repository-automation-project";
import { getGithubRepositoryAutomationSettings } from "./github-repository-automation-settings-store";
import {
  createGithubRepositoryAutomationSandbox,
  runGitDiffInSandbox,
  runGitLogInSandbox,
  stopGithubRepositoryAutomationSandbox,
} from "./github-repository-automation-sandbox";

const logger = createLogger("github-repo-automation-push-source");

export type GithubRepositoryAutomationPushSourceSummary = {
  totalCommits: number;
  counts: {
    uploaded: number;
    skipped: number;
    failed: number;
    unchanged: number;
  };
};

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

export async function runGithubRepositoryAutomationPushSource(input: {
  job: GithubRepositoryAutomationJobWithRepository;
  workflowRunId?: string | null;
  commitRange?: GithubRepositoryAutomationCommitRange;
}): Promise<GithubRepositoryAutomationPushSourceSummary | { skipped: true; reason: string }> {
  const job = input.job;

  if (!job.workflows.pushSource) {
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "skipped",
      skipReason: "push_source_workflow_disabled",
    });
    return { skipped: true, reason: "push_source_workflow_disabled" };
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
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "skipped",
      skipReason: "project_not_linked",
    });
    return { skipped: true, reason: "project_not_linked" };
  }

  const { commitBefore, commitAfter } =
    input.commitRange ?? (await resolveGithubRepositoryAutomationCommitRange(job));

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
      await updateGithubRepositoryAutomationJobStatus({
        jobId: job.id,
        status: "skipped",
        skipReason: "i18n_config_not_found",
      });
      return { skipped: true, reason: "i18n_config_not_found" };
    }

    if (i18nConfig.patterns.sourcePatterns.length === 0) {
      await updateGithubRepositoryAutomationJobStatus({
        jobId: job.id,
        status: "skipped",
        skipReason: "source_patterns_not_configured",
      });
      return { skipped: true, reason: "source_patterns_not_configured" };
    }

    const logArgs = buildCommitRangeLogArgs({ commitBefore, commitAfter });
    const logResult = await runGitLogInSandbox(sandboxId, logArgs);
    if (logResult.exitCode !== 0) {
      throw new Error("failed_to_list_commits_for_push_source");
    }

    const commits = parseCommitLogLines(logResult.output);
    const pathsToUpload = new Set<string>();

    for (const commit of commits) {
      const nameOnlyDiff = await runGitDiffInSandbox(
        sandboxId,
        buildCommitScopedDiffArgs({
          parentSha: commit.parentSha,
          commitSha: commit.sha,
          paths: i18nConfig.patterns.sourcePatterns,
        }),
      );

      const changedPaths = parseNameOnlyDiffPaths(
        nameOnlyDiff.exitCode === 0 ? nameOnlyDiff.output : "",
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

      await updateGithubRepositoryAutomationJobStatus({
        jobId: job.id,
        status: "skipped",
        skipReason: "no_relevant_source_file_changes",
        resultSummary: summary,
      });

      return { skipped: true, reason: "no_relevant_source_file_changes" };
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

    const finalStatus = summary.counts.failed > 0 ? "failed" : "succeeded";

    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: finalStatus,
      resultSummary: summary,
      lastError: finalStatus === "failed" ? "push_source_failed" : null,
    });

    logger.info(
      {
        jobId: job.id,
        counts: summary.counts,
      },
      "github repository automation push source completed",
    );

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "push source automation failed";

    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "failed",
      lastError: message,
    });

    throw error;
  } finally {
    if (sandboxId) {
      await stopGithubRepositoryAutomationSandbox(sandboxId).catch(() => undefined);
    }
  }
}
