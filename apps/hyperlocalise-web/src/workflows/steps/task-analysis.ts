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

/**
 * Reads the task's strings and scores them against the project's memory, once per language. A
 * failure fails the step, so the workflow runtime retries it; running again records nothing
 * twice.
 */
export async function analyseTaskStringsStep(input: TaskAnalysisInput) {
  "use step";
  const { analyseTaskStrings } = await import("@/lib/reporting/task-analysis");
  const strings = await analyseTaskStrings(input);
  return { strings };
}
