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
import { isMemoryUnavailableError } from "@/lib/reporting/capture";
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
  // The task's strings, once a language has been recorded: kept on the state however it ends.
  let strings: number | null = null;
  try {
    const days = new Set<string>();
    let incomplete = false;
    let error: string | null = null;
    for (const targetLocale of new Set(input.targetLocales)) {
      const language = { ...input, targetLocale };
      let recorded: { strings: number; days: string[] };
      try {
        recorded = await analyseTaskLanguageStep(language);
      } catch (failure) {
        // Only when the memory could not be read or scored after every retry are the strings
        // recorded without match bands, so the task has its quote, which its state then says is
        // not exact. Any other failure (a database error, a step that ran out of time) fails the
        // analysis instead: strings without bands are priced as new work, and that stays.
        if (!isMemoryUnavailableError(failure)) throw failure;
        error = messageOf(failure);
        recorded = await analyseTaskLanguageStep({ ...language, withoutMemory: true });
        incomplete = true;
      }
      strings = Math.max(strings ?? 0, recorded.strings);
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
    return { strings: strings ?? 0 };
  } catch (failure) {
    await setTaskAnalysisStatusStep({
      ...state,
      status: "failed",
      strings,
      error: messageOf(failure),
    });
    throw failure;
  }
}
