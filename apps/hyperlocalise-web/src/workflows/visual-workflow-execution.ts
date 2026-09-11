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
import { getWorkflowMetadata } from "workflow";

import type { VisualWorkflowExecutionEventData } from "@/lib/workflow/types";

import { executeVisualWorkflowStep } from "./steps/visual-workflow-execution";

export async function visualWorkflowExecutionWorkflow(event: VisualWorkflowExecutionEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  let result = await executeVisualWorkflowStep(event);
  for (let slice = 0; result.ok && result.value.continueExecution && slice < 1000; slice += 1) {
    result = await executeVisualWorkflowStep(event);
  }

  if (!result.ok) {
    return {
      ok: false as const,
      runId: result.error.runId ?? event.visualWorkflowRunId,
      message: result.error.message,
      workflowRunId,
    };
  }

  return {
    ok: true as const,
    runId: result.value.runId,
    status: result.value.status,
    workflowRunId,
  };
}
