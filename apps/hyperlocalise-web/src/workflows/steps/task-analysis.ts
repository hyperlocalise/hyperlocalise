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

/** Reads the task's strings and scores them against the project's memory, once per language. */
export async function analyseTaskStringsStep(input: TaskAnalysisInput) {
  "use step";
  const { analyseTaskStrings } = await import("@/lib/reporting/task-analysis");
  try {
    const strings = await analyseTaskStrings(input);
    return { strings };
  } catch (error) {
    console.warn("[task-analysis-workflow] analysis failed", { jobId: input.jobId, error });
    return { strings: 0 };
  }
}
