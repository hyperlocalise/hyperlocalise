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
import type { TaskAnalysisInput } from "@/lib/reporting/task-analysis";

import {
  analyseTaskLanguageStep,
  refreshTaskDaysStep,
  setTaskAnalysisStatusStep,
} from "./steps/task-analysis";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Records a task for people's strings for Reports, off the request that created the task: one
 * step per language, then the task's days in the summary, then the task's analysis state, which
 * its Report tab reads. The state was set pending when the task was created.
 */
export async function taskAnalysisWorkflow(input: TaskAnalysisInput) {
  "use workflow";

  const state = { organizationId: input.organizationId, jobId: input.jobId, step: input.step };
  try {
    const days = new Set<string>();
    let strings = 0;
    let incomplete = false;
    let error: string | null = null;
    for (const targetLocale of new Set(input.targetLocales)) {
      const language = { ...input, targetLocale };
      let recorded: { strings: number; days: string[] };
      try {
        recorded = await analyseTaskLanguageStep(language);
      } catch (failure) {
        // The memory could not be read or scored after every retry. The strings are recorded
        // without match bands, so the task has its quote, which its state then says is not exact.
        error = messageOf(failure);
        recorded = await analyseTaskLanguageStep({ ...language, withoutMemory: true });
        incomplete = true;
      }
      strings = Math.max(strings, recorded.strings);
      for (const day of recorded.days) days.add(day);
    }
    if (days.size > 0) {
      try {
        await refreshTaskDaysStep({
          organizationId: input.organizationId,
          projectId: input.projectId,
          days: [...days],
        });
      } catch (failure) {
        // The strings are recorded; the next scheduled run puts them in the summary.
        error = messageOf(failure);
      }
    }
    await setTaskAnalysisStatusStep({ ...state, status: "done", incomplete, strings, error });
    return { strings };
  } catch (failure) {
    await setTaskAnalysisStatusStep({ ...state, status: "failed", error: messageOf(failure) });
    throw failure;
  }
}
