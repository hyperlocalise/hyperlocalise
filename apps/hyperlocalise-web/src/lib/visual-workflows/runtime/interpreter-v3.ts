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
import type { VisualWorkflowV3Definition } from "../schema/types";
import {
  compileVisualWorkflowV3Definition,
  toVisualWorkflowExecutionDefinition,
} from "../validation/compile-workflow-v3";
import { createVisualWorkflowExecutionContext } from "./context";
import type { RetryResumeState } from "./retry-delay";
import {
  runVisualWorkflowInterpreter,
  type VisualWorkflowInterpreterExecuteNode,
  type VisualWorkflowInterpreterNodeUpdate,
  type VisualWorkflowInterpreterResult,
} from "./interpreter-server";

export async function runVisualWorkflowV3Interpreter(input: {
  definition: VisualWorkflowV3Definition;
  organizationId: string;
  triggerInput?: Record<string, unknown>;
  executeNode?: VisualWorkflowInterpreterExecuteNode;
  onNodeUpdate?: (update: VisualWorkflowInterpreterNodeUpdate) => Promise<void> | void;
  signal?: AbortSignal;
  shouldCancel?: () => Promise<boolean>;
  mockMode?: boolean;
  retryBackoff?: RetryResumeState | null;
}): Promise<VisualWorkflowInterpreterResult> {
  const compiled = compileVisualWorkflowV3Definition(input.definition);

  if (compiled.issues.length > 0) {
    return {
      ok: false,
      context: createVisualWorkflowExecutionContext({
        triggerInput: input.triggerInput,
      }),
      nodeResults: {},
      failedNodeId: "",
      error: {
        code: "invalid_graph",
        message: "Workflow graph is invalid.",
        issues: compiled.issues,
      },
    };
  }

  const executionDefinition = toVisualWorkflowExecutionDefinition(compiled);

  return runVisualWorkflowInterpreter({
    definition: executionDefinition,
    organizationId: input.organizationId,
    triggerInput: input.triggerInput,
    executeNode: input.executeNode,
    onNodeUpdate: input.onNodeUpdate,
    signal: input.signal,
    shouldCancel: input.shouldCancel,
    mockMode: input.mockMode,
    retryBackoff: input.retryBackoff,
  });
}
