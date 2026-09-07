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
import { executeVisualWorkflowNode } from "./execute-node";
import {
  getVisualWorkflowGraphIndex,
  runVisualWorkflowInterpreter as runVisualWorkflowInterpreterCore,
  type VisualWorkflowGraphIndex,
  type VisualWorkflowInterpreterExecuteNode,
  type VisualWorkflowInterpreterNodeUpdate,
  type VisualWorkflowInterpreterResult,
} from "./interpreter";
import type { VisualWorkflowDefinition } from "../schema/types";

export type {
  VisualWorkflowGraphIndex,
  VisualWorkflowInterpreterExecuteNode,
  VisualWorkflowInterpreterNodeUpdate,
  VisualWorkflowInterpreterResult,
};

export { getVisualWorkflowGraphIndex };

export async function runVisualWorkflowInterpreter(input: {
  definition: VisualWorkflowDefinition;
  organizationId: string;
  triggerInput?: Record<string, unknown>;
  executeNode?: VisualWorkflowInterpreterExecuteNode;
  onNodeUpdate?: (update: VisualWorkflowInterpreterNodeUpdate) => Promise<void> | void;
}): Promise<VisualWorkflowInterpreterResult> {
  return runVisualWorkflowInterpreterCore({
    ...input,
    executeNode: input.executeNode ?? executeVisualWorkflowNode,
  });
}
