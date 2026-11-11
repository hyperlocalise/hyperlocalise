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
import { isWorkspaceReportsCaptureEnabled } from "./capture";
import type { TaskAnalysisInput } from "./task-analysis";
import { setTaskAnalysisStatus } from "./task-analysis-status";

/**
 * Starts a task's analysis in the background, as its own workflow, so creating the task does not
 * wait for the project's memory to be read, and marks the analysis pending for the task's Report
 * tab (failed, if the workflow cannot start). Nothing starts while Reports is off for the
 * workspace. Never throws: a task is created whether or not Reports can analyse it.
 */
export async function startTaskAnalysis(input: TaskAnalysisInput): Promise<void> {
  try {
    if (input.targetLocales.length === 0) return;
    if (!(await isWorkspaceReportsCaptureEnabled(input.organizationId))) return;
    const state = { organizationId: input.organizationId, jobId: input.jobId, step: input.step };
    await setTaskAnalysisStatus({ ...state, status: "pending" });
    try {
      const { start } = await import("workflow/api");
      const { taskAnalysisWorkflow } = await import("@/workflows/task-analysis");
      await start(taskAnalysisWorkflow, [input]);
    } catch (error) {
      await setTaskAnalysisStatus({
        ...state,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } catch (error) {
    console.warn("reporting_task_analysis_start_failed", { jobId: input.jobId, error });
  }
}
