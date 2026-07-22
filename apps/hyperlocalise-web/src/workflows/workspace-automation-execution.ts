/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { getWorkflowMetadata } from "workflow";

import type { WorkspaceAutomationExecutionEventData } from "@/lib/workflow/types";

import { executeWorkspaceAutomationStep } from "./steps/workspace-automation-execution";

export async function workspaceAutomationExecutionWorkflow(
  event: WorkspaceAutomationExecutionEventData,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await executeWorkspaceAutomationStep(event);

  if (!result.ok) {
    return {
      ok: false as const,
      runId: result.error.runId ?? event.workspaceAutomationRunId,
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
