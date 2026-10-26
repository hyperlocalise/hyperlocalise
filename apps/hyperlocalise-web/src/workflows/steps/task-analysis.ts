/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { RetryableError } from "workflow";

import type { ReportStep, TaskAnalysisStatus } from "@/lib/reporting/report-units";
import type { TaskLanguageAnalysisInput } from "@/lib/reporting/task-analysis";

/**
 * Reads the task's strings and scores them against the project's memory for one language. A
 * failure fails the step, so the workflow runtime retries it; running again records nothing
 * twice. Its own step per language, so a retry keeps the languages already recorded and each
 * language has the step's whole time.
 */
export async function analyseTaskLanguageStep(input: TaskLanguageAnalysisInput) {
  "use step";
  const { analyseTaskLanguage } = await import("@/lib/reporting/task-analysis");
  return analyseTaskLanguage(input);
}

/** How long to wait before trying again while a scheduled run holds the task's project. */
const SUMMARY_BUSY_RETRY_AFTER = "30s";

/**
 * Brings the task's days in the summary up to date, so its strings show without waiting for the
 * scheduled run. Its own step, so a retry while that run holds the project reads no memory again,
 * and it is retried for some minutes: a scheduled run holds a large project for seconds.
 */
export async function refreshTaskDaysStep(input: {
  organizationId: string;
  projectId: string;
  days: string[];
}) {
  "use step";
  const { refreshTaskDays } = await import("@/lib/reporting/task-analysis");
  try {
    await refreshTaskDays(input);
  } catch (error) {
    if (error instanceof Error && error.message === "reporting_summary_busy")
      throw new RetryableError(error.message, { retryAfter: SUMMARY_BUSY_RETRY_AFTER });
    throw error;
  }
}
refreshTaskDaysStep.maxRetries = 10;

/** Records how the task's analysis ended, for its Report tab. */
export async function setTaskAnalysisStatusStep(input: {
  organizationId: string;
  jobId: string;
  step: ReportStep;
  status: TaskAnalysisStatus;
  incomplete?: boolean;
  strings?: number | null;
  error?: string | null;
}) {
  "use step";
  const { setTaskAnalysisStatus } = await import("@/lib/reporting/task-analysis-status");
  await setTaskAnalysisStatus(input);
}
