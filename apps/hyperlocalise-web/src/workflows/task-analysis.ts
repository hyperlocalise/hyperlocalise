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

import { analyseTaskStringsStep } from "./steps/task-analysis";

/** Records a task for people's strings for Reports, off the request that created the task. */
export async function taskAnalysisWorkflow(input: TaskAnalysisInput) {
  "use workflow";

  return analyseTaskStringsStep(input);
}
