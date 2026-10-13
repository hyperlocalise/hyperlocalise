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
import type { CanonicalVisualWorkflowNode } from "../schema/types";
import {
  createVisualWorkflowRun,
  executeVisualWorkflowRun,
  getVisualWorkflowReturnedOutputs,
} from "../visual-workflow-runs";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

function subworkflowIdempotencyKey(input: {
  parentRunId: string;
  nodeId: string;
  iteration?: number;
  attempt: number;
}): string {
  return `subworkflow:${input.parentRunId}:${input.nodeId}:${input.iteration ?? -1}:${input.attempt}`;
}

export async function executeSubworkflowNode(input: {
  node: CanonicalVisualWorkflowNode;
  organizationId: string;
  parentRunId: string;
  traceId: string;
  iteration?: number;
  attempt: number;
}): Promise<VisualWorkflowNodeExecutionResult> {
  if (input.node.config.kind !== "flow.call_workflow") {
    return {
      ok: false,
      error: { code: "invalid_subworkflow_node", message: "Invalid subworkflow node." },
    };
  }

  const childInput = Object.fromEntries(
    input.node.config.inputFields.map((field) => [
      field.name,
      (input.node.config as unknown as Record<string, unknown>)[`value.${field.id}`],
    ]),
  );
  let child;
  try {
    child = await createVisualWorkflowRun({
      organizationId: input.organizationId,
      visualWorkflowId: input.node.config.workflowId,
      immutableDefinitionVersion: input.node.config.version,
      triggerSource: "manual",
      idempotencyKey: subworkflowIdempotencyKey({
        parentRunId: input.parentRunId,
        nodeId: input.node.id,
        iteration: input.iteration,
        attempt: input.attempt,
      }),
      inputSnapshot: childInput,
      parentRunId: input.parentRunId,
      parentNodeId: input.node.id,
      traceId: input.traceId,
      enqueue: false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "subworkflow_create_failed";
    return {
      ok: false,
      error: {
        code,
        message: "The pinned subworkflow version could not be started.",
      },
    };
  }

  const executed = await executeVisualWorkflowRun({
    runId: child.id,
    organizationId: input.organizationId,
    visualWorkflowId: child.visualWorkflowId,
  });

  if (!executed) {
    return {
      ok: false,
      error: { code: "subworkflow_not_found", message: "The child workflow run was not found." },
    };
  }

  if (executed.status === "queued" || executed.status === "running") {
    return {
      ok: false,
      error: {
        code: "yield_execution",
        message: "The child workflow is still running.",
        ...(executed.executionPausedUntil ? { wakeAt: executed.executionPausedUntil } : {}),
      },
    };
  }

  if (executed.status !== "succeeded") {
    return {
      ok: false,
      error: {
        ...executed.error,
        code:
          executed.status === "cancelled"
            ? "cancelled"
            : typeof executed.error?.code === "string"
              ? executed.error.code
              : "subworkflow_failed",
        message:
          typeof executed.error?.message === "string"
            ? executed.error.message
            : "The child workflow failed.",
      },
    };
  }

  const returnedOutputs = await getVisualWorkflowReturnedOutputs({
    organizationId: input.organizationId,
    runId: executed.id,
  });

  return {
    ok: true,
    output: {
      value: Object.fromEntries(
        input.node.config.outputFields.map((field) => [field.id, returnedOutputs[field.name]]),
      ),
      childRunId: executed.id,
      traceId: executed.traceId,
      definitionVersion: executed.definitionVersion,
    },
  };
}
