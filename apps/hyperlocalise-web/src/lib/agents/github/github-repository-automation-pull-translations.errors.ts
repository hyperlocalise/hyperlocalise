import { updateGithubRepositoryAutomationJobStatus } from "./github-repository-automation-jobs";

import type { GithubRepositoryAutomationPullTranslationsSummary } from "./github-repository-automation-pull-translations.types";

export type GithubRepositoryAutomationPullTranslationsError =
  | { code: "pull_translations_workflow_disabled" }
  | { code: "project_not_linked" }
  | { code: "i18n_config_not_found" }
  | { code: "target_patterns_not_configured" }
  | {
      code: "no_translation_exports_available";
      summary: GithubRepositoryAutomationPullTranslationsSummary;
    }
  | {
      code: "no_repository_changes";
      summary: GithubRepositoryAutomationPullTranslationsSummary;
    }
  | { code: "base_branch_advanced"; expectedBaseSha: string; actualBaseSha: string }
  | { code: "protected_branch"; branch: string; reason: string }
  | { code: "cannot_push_to_repository"; reason: string }
  | {
      code: "pull_translations_failed";
      summary: GithubRepositoryAutomationPullTranslationsSummary;
    }
  | { code: "infrastructure"; message: string };

export function isPullTranslationsSkipError(
  error: GithubRepositoryAutomationPullTranslationsError,
): boolean {
  return (
    error.code === "pull_translations_workflow_disabled" ||
    error.code === "project_not_linked" ||
    error.code === "i18n_config_not_found" ||
    error.code === "target_patterns_not_configured" ||
    error.code === "no_translation_exports_available" ||
    error.code === "no_repository_changes"
  );
}

export async function persistPullTranslationsSkippedJob(input: {
  jobId: string;
  error: GithubRepositoryAutomationPullTranslationsError;
}): Promise<void> {
  const resultSummary =
    input.error.code === "no_translation_exports_available" ||
    input.error.code === "no_repository_changes"
      ? input.error.summary
      : null;

  await updateGithubRepositoryAutomationJobStatus({
    jobId: input.jobId,
    status: "skipped",
    skipReason: input.error.code,
    resultSummary,
  });
}

export async function persistPullTranslationsFailedJob(input: {
  jobId: string;
  error: GithubRepositoryAutomationPullTranslationsError;
  lastError?: string | null;
  resultSummary?: Record<string, unknown> | null;
}): Promise<void> {
  const summaryFromError =
    input.error.code === "pull_translations_failed" ||
    input.error.code === "no_translation_exports_available" ||
    input.error.code === "no_repository_changes"
      ? input.error.summary
      : null;

  const lastError =
    input.lastError ??
    (input.error.code === "infrastructure"
      ? input.error.message
      : input.error.code === "base_branch_advanced"
        ? `base_branch_advanced:${input.error.actualBaseSha}`
        : input.error.code === "protected_branch"
          ? input.error.reason
          : input.error.code === "cannot_push_to_repository"
            ? input.error.reason
            : input.error.code === "pull_translations_failed"
              ? "pull_translations_failed"
              : input.error.code);

  await updateGithubRepositoryAutomationJobStatus({
    jobId: input.jobId,
    status: "failed",
    skipReason: null,
    resultSummary: input.resultSummary ?? summaryFromError,
    lastError,
  });
}
