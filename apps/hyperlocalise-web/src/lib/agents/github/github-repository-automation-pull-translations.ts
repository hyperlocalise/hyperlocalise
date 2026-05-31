import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { canPushToGitHubRepository } from "@/lib/agents/repository-write-gate";

import {
  resolveGithubRepositoryAutomationCommitRange,
  type GithubRepositoryAutomationCommitRange,
} from "./github-repository-automation-commit-range";
import {
  discoverI18nConfigInSandbox,
  loadI18nConfigJsonFromSandbox,
} from "./github-repository-automation-i18n-config";
import type { GithubRepositoryAutomationJobWithRepository } from "./github-repository-automation-jobs";
import { updateGithubRepositoryAutomationJobStatus } from "./github-repository-automation-jobs";
import {
  listPullTranslationExportCandidates,
  type PullTranslationExportCandidate,
} from "./github-repository-automation-pull-translations-export";
import {
  type GithubRepositoryAutomationPullTranslationsError,
  persistPullTranslationsFailedJob,
  persistPullTranslationsSkippedJob,
} from "./github-repository-automation-pull-translations.errors";
import { buildPullTranslationsBranchName } from "./github-repository-automation-pull-translations-branch";
import {
  commitPushAndCreatePullTranslationsPullRequest,
  hasDiffAgainstBase,
  verifyExpectedBaseBranchHead,
} from "./github-repository-automation-pull-translations-pr";
import { resolveGithubRepositoryAutomationProjectId } from "./github-repository-automation-project";
import { getGithubRepositoryAutomationSettings } from "./github-repository-automation-settings-store";
import {
  createGithubRepositoryAutomationSandbox,
  stopGithubRepositoryAutomationSandbox,
} from "./github-repository-automation-sandbox";

import type { GithubRepositoryAutomationPullTranslationsSummary } from "./github-repository-automation-pull-translations.types";

const logger = createLogger("github-repo-automation-pull-translations");

export type { GithubRepositoryAutomationPullTranslationsError } from "./github-repository-automation-pull-translations.errors";
export type { GithubRepositoryAutomationPullTranslationsSummary } from "./github-repository-automation-pull-translations.types";

function parseInstallationId(installationId: string): number {
  return Number.parseInt(installationId, 10);
}

function buildPullTranslationsSummary(input: {
  baseSha: string;
  baseBranch: string;
  branchName: string;
  candidates: PullTranslationExportCandidate[];
  written: number;
  skipped: number;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
}): GithubRepositoryAutomationPullTranslationsSummary {
  const linkedTranslationJobIds = [
    ...new Set(input.candidates.map((candidate) => candidate.translationJobId)),
  ];

  return {
    baseSha: input.baseSha,
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    pullRequestUrl: input.pullRequestUrl,
    pullRequestNumber: input.pullRequestNumber,
    counts: {
      planned: input.candidates.length,
      written: input.written,
      skipped: input.skipped,
      failed: 0,
    },
    linkedTranslationJobIds,
  };
}

async function returnPullTranslationsSkipped(
  jobId: string,
  error: GithubRepositoryAutomationPullTranslationsError,
): Promise<Result<never, GithubRepositoryAutomationPullTranslationsError>> {
  await persistPullTranslationsSkippedJob({ jobId, error });
  return err(error);
}

async function returnPullTranslationsFailed(
  jobId: string,
  error: GithubRepositoryAutomationPullTranslationsError,
  lastError?: string | null,
): Promise<Result<never, GithubRepositoryAutomationPullTranslationsError>> {
  await persistPullTranslationsFailedJob({ jobId, error, lastError });
  return err(error);
}

export async function runGithubRepositoryAutomationPullTranslations(input: {
  job: GithubRepositoryAutomationJobWithRepository;
  commitRange?: GithubRepositoryAutomationCommitRange;
}): Promise<
  Result<
    GithubRepositoryAutomationPullTranslationsSummary,
    GithubRepositoryAutomationPullTranslationsError
  >
> {
  const job = input.job;

  if (!job.workflows.pullTranslations) {
    return returnPullTranslationsSkipped(job.id, { code: "pull_translations_workflow_disabled" });
  }

  const settingsRecord = await getGithubRepositoryAutomationSettings({
    githubInstallationRepositoryId: job.githubInstallationRepositoryId,
    githubRepositoryId: job.githubRepositoryId,
  });

  const projectId = await resolveGithubRepositoryAutomationProjectId({
    organizationId: job.organizationId,
    repositoryFullName: job.repositoryFullName,
    configuredProjectId: settingsRecord.settings.workflows.pullTranslations.projectId,
  });

  if (!projectId) {
    return returnPullTranslationsSkipped(job.id, { code: "project_not_linked" });
  }

  const installationId = parseInstallationId(job.githubInstallationId);

  const repositoryPush = await canPushToGitHubRepository({
    installationId,
    repositoryFullName: job.repositoryFullName,
  });
  if (!repositoryPush.canPush) {
    return returnPullTranslationsFailed(job.id, {
      code: "cannot_push_to_repository",
      reason: repositoryPush.reason ?? "Cannot push to repository.",
    });
  }

  const commitRangeResult: Result<
    GithubRepositoryAutomationCommitRange,
    GithubRepositoryAutomationPullTranslationsError
  > = input.commitRange ? ok(input.commitRange) : await resolveCommitRangeForPullTranslations(job);

  if (isErr(commitRangeResult)) {
    return returnPullTranslationsFailed(job.id, commitRangeResult.error);
  }

  const { commitAfter } = commitRangeResult.value;
  const baseBranch = job.triggerBranch ?? job.defaultBranch;
  if (!baseBranch) {
    return returnPullTranslationsFailed(job.id, {
      code: "infrastructure",
      message: "github_repository_automation_branch_not_resolved",
    });
  }

  const baseHead = await verifyExpectedBaseBranchHead({
    installationId: job.githubInstallationId,
    repositoryFullName: job.repositoryFullName,
    baseBranch,
    expectedBaseSha: commitAfter,
  });
  if (!baseHead.ok) {
    return returnPullTranslationsFailed(job.id, {
      code: "base_branch_advanced",
      expectedBaseSha: commitAfter,
      actualBaseSha: baseHead.actualBaseSha,
    });
  }

  if (!input.commitRange && !job.commitAfter) {
    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "running",
      commitBefore: commitRangeResult.value.commitBefore,
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
      return returnPullTranslationsSkipped(job.id, { code: "i18n_config_not_found" });
    }

    if (i18nConfig.patterns.targetPatterns.length === 0) {
      return returnPullTranslationsSkipped(job.id, { code: "target_patterns_not_configured" });
    }

    const configJson = await loadI18nConfigJsonFromSandbox(sandboxId, i18nConfig.configPath);
    if (!configJson) {
      return returnPullTranslationsSkipped(job.id, { code: "i18n_config_not_found" });
    }

    const candidates = await listPullTranslationExportCandidates({
      organizationId: job.organizationId,
      projectId,
      configJson,
    });

    const branchNameForSummary = buildPullTranslationsBranchName(job.id);

    if (candidates.length === 0) {
      const summary = buildPullTranslationsSummary({
        baseSha: commitAfter,
        baseBranch,
        branchName: branchNameForSummary,
        candidates: [],
        written: 0,
        skipped: 0,
      });

      return returnPullTranslationsSkipped(job.id, {
        code: "no_translation_exports_available",
        summary,
      });
    }

    const targetPaths = [...new Set(candidates.map((candidate) => candidate.targetPath))].sort();
    const hasChanges = await hasDiffAgainstBase({
      sandboxId,
      baseSha: commitAfter,
      paths: targetPaths,
      candidates,
    });

    if (!hasChanges) {
      const summary = buildPullTranslationsSummary({
        baseSha: commitAfter,
        baseBranch,
        branchName: branchNameForSummary,
        candidates,
        written: 0,
        skipped: candidates.length,
      });

      return returnPullTranslationsSkipped(job.id, {
        code: "no_repository_changes",
        summary,
      });
    }

    const pullRequest = await commitPushAndCreatePullTranslationsPullRequest({
      sandboxId,
      installationId: job.githubInstallationId,
      repositoryFullName: job.repositoryFullName,
      automationJobId: job.id,
      organizationSlug: job.organizationSlug,
      githubRepositoryId: job.githubRepositoryId,
      baseBranch,
      baseSha: commitAfter,
      branchName: branchNameForSummary,
      paths: targetPaths,
      candidates,
      linkedTranslationJobIds: [
        ...new Set(candidates.map((candidate) => candidate.translationJobId)),
      ],
    });

    const summary = buildPullTranslationsSummary({
      baseSha: commitAfter,
      baseBranch,
      branchName: branchNameForSummary,
      candidates,
      written: candidates.length,
      skipped: 0,
      pullRequestUrl: pullRequest.pullRequestUrl,
      pullRequestNumber: pullRequest.pullRequestNumber,
    });

    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "succeeded",
      resultSummary: summary,
      lastError: null,
    });

    logger.info(
      {
        jobId: job.id,
        pullRequestNumber: pullRequest.pullRequestNumber,
        pathCount: targetPaths.length,
      },
      "github repository automation pull translations completed",
    );

    return ok(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "pull_translations_automation_failed";

    logger.error(
      {
        jobId: job.id,
        err: error,
      },
      "github repository automation pull translations failed",
    );

    const partialSummary = buildPullTranslationsSummary({
      baseSha: commitAfter,
      baseBranch,
      branchName: buildPullTranslationsBranchName(job.id),
      candidates: [],
      written: 0,
      skipped: 0,
    });

    return returnPullTranslationsFailed(
      job.id,
      { code: "pull_translations_failed", summary: partialSummary },
      message,
    );
  } finally {
    if (sandboxId) {
      await stopGithubRepositoryAutomationSandbox(sandboxId).catch(() => undefined);
    }
  }
}

async function resolveCommitRangeForPullTranslations(
  job: GithubRepositoryAutomationJobWithRepository,
): Promise<
  Result<GithubRepositoryAutomationCommitRange, GithubRepositoryAutomationPullTranslationsError>
> {
  try {
    const commitRange = await resolveGithubRepositoryAutomationCommitRange(job);
    return ok(commitRange);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "failed_to_resolve_commit_range_for_pull_translations";

    return err({ code: "infrastructure", message });
  }
}
