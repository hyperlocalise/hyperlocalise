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
import type { VisualWorkflowExecutionEventData } from "@/lib/workflow/types";

/**
 * Step-local result types duplicated here so this file — statically imported by a
 * `"use workflow"` module — never pulls the interpreter graph into the workflow bundle.
 */
export type VisualWorkflowExecutionStepResult =
  | {
      ok: true;
      value: {
        runId: string;
        status: string;
      };
    }
  | {
      ok: false;
      error: {
        code: "visual_workflow_not_found" | "visual_workflow_run_not_found" | "execution_failed";
        message: string;
        runId?: string;
      };
    };

export async function executeVisualWorkflowStep(
  event: VisualWorkflowExecutionEventData,
): Promise<VisualWorkflowExecutionStepResult> {
  "use step";

  const { createLogger } = await import("@/lib/log");
  const logger = createLogger("visual-workflow-step");

  const stepContext = {
    visualWorkflowRunId: event.visualWorkflowRunId,
    visualWorkflowId: event.visualWorkflowId,
    organizationId: event.organizationId,
  };

  logger.info(stepContext, "visual workflow execution step started");

  const { executeVisualWorkflowRun, failInFlightVisualWorkflowRun } =
    await import("@/lib/visual-workflows/visual-workflow-runs");

  try {
    const run = await executeVisualWorkflowRun({
      runId: event.visualWorkflowRunId,
      organizationId: event.organizationId,
      visualWorkflowId: event.visualWorkflowId,
    });

    if (!run) {
      return {
        ok: false,
        error: {
          code: "visual_workflow_run_not_found",
          message: "Visual workflow run was not found.",
          runId: event.visualWorkflowRunId,
        },
      };
    }

    if (run.status === "failed") {
      return {
        ok: false,
        error: {
          code: "execution_failed",
          message:
            typeof run.error?.message === "string"
              ? run.error.message
              : "Visual workflow execution failed.",
          runId: run.id,
        },
      };
    }

    logger.info({ ...stepContext, status: run.status }, "visual workflow execution step completed");
    return {
      ok: true,
      value: {
        runId: run.id,
        status: run.status,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "visual_workflow_step_failed";
    logger.error({ ...stepContext, message }, "visual workflow execution step threw");

    await failInFlightVisualWorkflowRun({
      runId: event.visualWorkflowRunId,
      organizationId: event.organizationId,
      visualWorkflowId: event.visualWorkflowId,
      message,
    }).catch(() => undefined);

    throw error;
  }
}
