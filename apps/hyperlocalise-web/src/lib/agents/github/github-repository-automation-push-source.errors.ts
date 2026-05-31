import { updateGithubRepositoryAutomationJobStatus } from "./github-repository-automation-jobs";

import type { GithubRepositoryAutomationPushSourceSummary } from "./github-repository-automation-push-source.types";

export type GithubRepositoryAutomationPushSourceError =
  | { code: "push_source_workflow_disabled" }
  | { code: "project_not_linked" }
  | { code: "i18n_config_not_found" }
  | { code: "source_patterns_not_configured" }
  | {
      code: "no_relevant_source_file_changes";
      summary: GithubRepositoryAutomationPushSourceSummary;
    }
  | { code: "failed_to_list_commits" }
  | {
      code: "push_source_failed";
      summary: GithubRepositoryAutomationPushSourceSummary;
    }
  | { code: "infrastructure"; message: string };

export function isPushSourceSkipError(error: GithubRepositoryAutomationPushSourceError): boolean {
  return (
    error.code === "push_source_workflow_disabled" ||
    error.code === "project_not_linked" ||
    error.code === "i18n_config_not_found" ||
    error.code === "source_patterns_not_configured" ||
    error.code === "no_relevant_source_file_changes"
  );
}

export async function persistPushSourceSkippedJob(input: {
  jobId: string;
  error: GithubRepositoryAutomationPushSourceError;
}): Promise<void> {
  const resultSummary =
    input.error.code === "no_relevant_source_file_changes" ? input.error.summary : null;

  await updateGithubRepositoryAutomationJobStatus({
    jobId: input.jobId,
    status: "skipped",
    skipReason: input.error.code,
    resultSummary,
  });
}

export async function persistPushSourceFailedJob(input: {
  jobId: string;
  error: GithubRepositoryAutomationPushSourceError;
  lastError?: string | null;
}): Promise<void> {
  const resultSummary =
    input.error.code === "push_source_failed" ||
    input.error.code === "no_relevant_source_file_changes"
      ? input.error.summary
      : null;

  await updateGithubRepositoryAutomationJobStatus({
    jobId: input.jobId,
    status: "failed",
    skipReason: null,
    resultSummary,
    lastError:
      input.lastError ??
      (input.error.code === "infrastructure"
        ? input.error.message
        : input.error.code === "push_source_failed"
          ? "push_source_failed"
          : input.error.code),
  });
}
