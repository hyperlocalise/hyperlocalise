import { createLogger } from "@/lib/log";

import { runRepositoryLocalisationAgentForCommit } from "./github-repository-automation-agent";
import {
  listGithubRepositoryAutomationCommitResults,
  summarizeCommitResults,
  upsertGithubRepositoryAutomationCommitResult,
} from "./github-repository-automation-commit-results";
import {
  buildCommitRangeLogArgs,
  buildCommitScopedDiffArgs,
  buildCommitScopedPatchArgs,
  buildSuggestedFixesFromHlCheckReport,
  classifyHlCheckReport,
  parseCommitLogLines,
  parseNameOnlyDiffPaths,
  shouldSkipCommitForPaths,
} from "./github-repository-automation-commits";
import {
  completeGithubRepositoryAutomationCheckRun,
  createGithubRepositoryAutomationCheckRun,
} from "./github-repository-automation-check-run";
import { discoverI18nConfigInSandbox } from "./github-repository-automation-i18n-config";
import { runHlCheckDiffInSandbox } from "./github-repository-automation-hl-check";
import type { GithubRepositoryAutomationJobWithRepository } from "./github-repository-automation-jobs";
import {
  resolveGithubRepositoryAutomationCommitRange,
  type GithubRepositoryAutomationCommitRange,
} from "./github-repository-automation-commit-range";
import { updateGithubRepositoryAutomationJobStatus } from "./github-repository-automation-jobs";
import {
  checkoutCommitInSandbox,
  createGithubRepositoryAutomationSandbox,
  runGitDiffInSandbox,
  runGitLogInSandbox,
  stopGithubRepositoryAutomationSandbox,
} from "./github-repository-automation-sandbox";

const logger = createLogger("github-repo-automation-validation");

const MAX_DIFF_EXCERPT_CHARS = 12_000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_EXCERPT_CHARS) {
    return diff;
  }
  return `${diff.slice(0, MAX_DIFF_EXCERPT_CHARS)}\n\n[diff truncated]`;
}

function resolveJobFinalStatus(input: {
  summary: ReturnType<typeof summarizeCommitResults>;
  blockOnFailure: boolean;
}): "succeeded" | "failed" {
  if (!input.summary.hasBlockingFailures) {
    return "succeeded";
  }

  return input.blockOnFailure ? "failed" : "succeeded";
}

function buildCheckRunSummary(summary: ReturnType<typeof summarizeCommitResults>): string {
  const counts = summary.counts as Record<string, number>;
  const totalCommits = typeof summary.totalCommits === "number" ? summary.totalCommits : 0;
  const lines = [
    `Validated ${totalCommits} commit(s).`,
    `Passed: ${counts.passed ?? 0}, warnings: ${counts.warning ?? 0}, failed: ${counts.failed ?? 0}, skipped: ${counts.skipped ?? 0}, errors: ${counts.error ?? 0}.`,
  ];

  if (summary.hasBlockingFailures) {
    lines.push("Blocking localization findings were detected.");
  } else if (summary.hasInfrastructureErrors) {
    lines.push(
      "Infrastructure errors occurred during validation; localization findings were not blocking.",
    );
  } else {
    lines.push("No blocking localization findings were detected.");
  }

  return lines.join(" ");
}

function resolveCheckRunConclusion(input: {
  finalStatus: "succeeded" | "failed";
  summary: ReturnType<typeof summarizeCommitResults>;
}): "success" | "failure" | "neutral" {
  if (input.finalStatus === "failed") {
    return "failure";
  }

  if (input.summary.hasInfrastructureErrors) {
    return "neutral";
  }

  return "success";
}

export async function runGithubRepositoryAutomationValidation(input: {
  job: GithubRepositoryAutomationJobWithRepository;
  workflowRunId?: string | null;
  commitRange?: GithubRepositoryAutomationCommitRange;
}): Promise<Record<string, unknown>> {
  const job = input.job;
  const workflows = job.workflows;

  if (!workflows.validation) {
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "skipped",
      skipReason: "validation_workflow_disabled",
    });
    return { skipped: true, reason: "validation_workflow_disabled" };
  }

  const blockOnFailure = workflows.validationBlockOnFailure ?? true;
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

  const checkRunDetails = {
    organizationSlug: job.organizationSlug,
    githubRepositoryId: job.githubRepositoryId,
    jobId: job.id,
  };

  let sandboxId: string | null = null;
  let checkRunId: string | null = job.githubCheckRunId;
  const shouldPublishCheckRun = job.workflows.statusCheck.enabled;

  try {
    if (shouldPublishCheckRun && !checkRunId) {
      checkRunId = await createGithubRepositoryAutomationCheckRun({
        installationId: job.githubInstallationId,
        repositoryFullName: job.repositoryFullName,
        headSha: commitAfter,
        ...checkRunDetails,
      });
      if (checkRunId) {
        await updateGithubRepositoryAutomationJobStatus({
          jobId: job.id,
          status: "running",
          githubCheckRunId: checkRunId,
        });
      }
    }

    sandboxId = await createGithubRepositoryAutomationSandbox({
      installationId: job.githubInstallationId,
      repositoryFullName: job.repositoryFullName,
      revision: commitAfter,
      cloneDepth: 50,
    });

    const i18nConfig = await discoverI18nConfigInSandbox(sandboxId);
    if (!i18nConfig) {
      await upsertGithubRepositoryAutomationCommitResult({
        jobId: job.id,
        commitSha: commitAfter,
        parentCommitSha: commitBefore,
        status: "skipped",
        skipReason: "i18n_config_not_found",
      });

      const summary = summarizeCommitResults(
        await listGithubRepositoryAutomationCommitResults({ jobId: job.id }),
      );
      const finalStatus = "succeeded";

      if (checkRunId) {
        await completeGithubRepositoryAutomationCheckRun({
          installationId: job.githubInstallationId,
          repositoryFullName: job.repositoryFullName,
          checkRunId,
          conclusion: "neutral",
          summary: "No Hyperlocalise i18n config was found in the repository.",
          ...checkRunDetails,
        });
      }

      await updateGithubRepositoryAutomationJobStatus({
        jobId: job.id,
        status: finalStatus,
        resultSummary: summary,
        githubCheckRunId: checkRunId,
      });

      return summary;
    }

    const logArgs = buildCommitRangeLogArgs({ commitBefore, commitAfter });
    const logResult = await runGitLogInSandbox(sandboxId, logArgs);
    if (logResult.exitCode !== 0) {
      throw new Error("failed to list commits for automation validation");
    }

    const commits = parseCommitLogLines(logResult.output);
    if (commits.length === 0) {
      await upsertGithubRepositoryAutomationCommitResult({
        jobId: job.id,
        commitSha: commitAfter,
        parentCommitSha: commitBefore,
        status: "skipped",
        skipReason: "no_commits_in_range",
      });
    }

    for (const commit of commits) {
      await checkoutCommitInSandbox(sandboxId, commit.sha);

      const nameOnlyDiff = await runGitDiffInSandbox(
        sandboxId,
        buildCommitScopedDiffArgs({
          parentSha: commit.parentSha,
          commitSha: commit.sha,
          paths: [...i18nConfig.patterns.sourcePatterns, ...i18nConfig.patterns.targetPatterns],
        }),
      );

      const changedPaths = parseNameOnlyDiffPaths(
        nameOnlyDiff.exitCode === 0 ? nameOnlyDiff.output : "",
      );
      const skipDecision = shouldSkipCommitForPaths({
        changedPaths,
        patterns: i18nConfig.patterns,
      });

      if (skipDecision.skipped) {
        await upsertGithubRepositoryAutomationCommitResult({
          jobId: job.id,
          commitSha: commit.sha,
          parentCommitSha: commit.parentSha,
          status: "skipped",
          skipReason: skipDecision.reason,
          changedPaths,
        });
        continue;
      }

      const patchDiff = await runGitDiffInSandbox(
        sandboxId,
        buildCommitScopedPatchArgs({
          parentSha: commit.parentSha,
          commitSha: commit.sha,
          paths: skipDecision.paths,
        }),
      );

      if (patchDiff.exitCode !== 0) {
        await upsertGithubRepositoryAutomationCommitResult({
          jobId: job.id,
          commitSha: commit.sha,
          parentCommitSha: commit.parentSha,
          status: "error",
          skipReason: "failed_to_build_commit_diff",
          changedPaths: skipDecision.paths,
        });
        continue;
      }

      let hlCheckReport = null;
      let hlStatus: "passed" | "warning" | "failed" | "error" = "passed";
      let agentSummary: string | null = null;
      let suggestedFixes: Record<string, unknown>[] | null = null;

      try {
        hlCheckReport = await runHlCheckDiffInSandbox({
          sandboxId,
          configPath: i18nConfig.configPath,
          diffPatch: patchDiff.output,
        });
        hlStatus = classifyHlCheckReport(hlCheckReport);
        suggestedFixes = buildSuggestedFixesFromHlCheckReport(hlCheckReport);
      } catch (error) {
        hlStatus = "error";
        await upsertGithubRepositoryAutomationCommitResult({
          jobId: job.id,
          commitSha: commit.sha,
          parentCommitSha: commit.parentSha,
          status: "error",
          skipReason: "hl_check_failed",
          changedPaths: skipDecision.paths,
          agentSummary: error instanceof Error ? error.message : "hl check failed",
        });
        continue;
      }

      try {
        agentSummary = await runRepositoryLocalisationAgentForCommit({
          organizationId: job.organizationId,
          sandboxId,
          workflowRunId: input.workflowRunId,
          commitSha: commit.sha,
          parentCommitSha: commit.parentSha,
          changedPaths: skipDecision.paths,
          diffExcerpt: truncateDiff(patchDiff.output),
        });
      } catch (error) {
        logger.warn(
          {
            jobId: job.id,
            commitSha: commit.sha,
          },
          "repository localization agent failed for commit",
        );
        agentSummary =
          error instanceof Error ? error.message : "repository localization agent failed";
        if (hlStatus === "passed") {
          hlStatus = "warning";
        }
      }

      await upsertGithubRepositoryAutomationCommitResult({
        jobId: job.id,
        commitSha: commit.sha,
        parentCommitSha: commit.parentSha,
        status: hlStatus,
        changedPaths: skipDecision.paths,
        hlCheckReport,
        agentSummary,
        suggestedFixes,
      });
    }

    const results = await listGithubRepositoryAutomationCommitResults({ jobId: job.id });
    const summary = summarizeCommitResults(results);
    const finalStatus = resolveJobFinalStatus({ summary, blockOnFailure });

    if (checkRunId) {
      await completeGithubRepositoryAutomationCheckRun({
        installationId: job.githubInstallationId,
        repositoryFullName: job.repositoryFullName,
        checkRunId,
        conclusion: resolveCheckRunConclusion({ finalStatus, summary }),
        summary: buildCheckRunSummary(summary),
        ...checkRunDetails,
      });
    }

    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: finalStatus,
      resultSummary: summary,
      githubCheckRunId: checkRunId,
      lastError: finalStatus === "failed" ? "localization_validation_failed" : null,
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "automation validation failed";

    if (checkRunId) {
      await completeGithubRepositoryAutomationCheckRun({
        installationId: job.githubInstallationId,
        repositoryFullName: job.repositoryFullName,
        checkRunId,
        conclusion: "failure",
        summary: message,
        ...checkRunDetails,
      }).catch(() => undefined);
    }

    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "failed",
      lastError: message,
      githubCheckRunId: checkRunId,
    });

    throw error;
  } finally {
    if (sandboxId) {
      await stopGithubRepositoryAutomationSandbox(sandboxId).catch(() => undefined);
    }
  }
}
