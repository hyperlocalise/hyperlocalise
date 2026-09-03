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
import type { VisualWorkflowDefinition } from "../schema/types";
import {
  createVisualWorkflowExecutionContext,
  setNodeOutput,
  type VisualWorkflowExecutionContext,
} from "./context";
import { executeVisualWorkflowNode } from "./execute-node";
import {
  buildVisualWorkflowGraphIndex,
  selectNextEdges,
  type VisualWorkflowGraphIndex,
} from "./graph-index";

export type VisualWorkflowInterpreterNodeUpdate = {
  nodeId: string;
  nodeType: string;
  status: "running" | "succeeded" | "failed";
  inputSnapshot?: Record<string, unknown>;
  outputSnapshot?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
};

export type VisualWorkflowInterpreterResult =
  | {
      ok: true;
      context: VisualWorkflowExecutionContext;
      nodeResults: Record<string, Record<string, unknown>>;
    }
  | {
      ok: false;
      context: VisualWorkflowExecutionContext;
      nodeResults: Record<string, Record<string, unknown>>;
      failedNodeId: string;
      error: Record<string, unknown>;
    };

export async function runVisualWorkflowInterpreter(input: {
  definition: VisualWorkflowDefinition;
  organizationId: string;
  triggerInput?: Record<string, unknown>;
  onNodeUpdate?: (update: VisualWorkflowInterpreterNodeUpdate) => Promise<void> | void;
}): Promise<VisualWorkflowInterpreterResult> {
  const graph = buildVisualWorkflowGraphIndex(input.definition);
  if (!graph) {
    return {
      ok: false,
      context: createVisualWorkflowExecutionContext({ triggerInput: input.triggerInput }),
      nodeResults: {},
      failedNodeId: "",
      error: { message: "Workflow graph is invalid." },
    };
  }

  const context = createVisualWorkflowExecutionContext({ triggerInput: input.triggerInput });
  const nodeResults: Record<string, Record<string, unknown>> = {};
  const completed = new Set<string>();
  const pendingIncoming = new Map(graph.incomingCountByNodeId);
  const queue = [graph.triggerNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || completed.has(nodeId)) {
      continue;
    }
    completed.add(nodeId);

    const node = graph.nodesById.get(nodeId);
    if (!node) {
      continue;
    }

    await input.onNodeUpdate?.({
      nodeId,
      nodeType: node.type,
      status: "running",
      inputSnapshot: {
        config: node.config,
      },
    });

    const execution = await executeVisualWorkflowNode({
      node,
      context,
      organizationId: input.organizationId,
    });

    if (!execution.ok) {
      await input.onNodeUpdate?.({
        nodeId,
        nodeType: node.type,
        status: "failed",
        error: execution.error,
      });
      return {
        ok: false,
        context,
        nodeResults,
        failedNodeId: nodeId,
        error: execution.error,
      };
    }

    setNodeOutput(context, nodeId, execution.output);
    nodeResults[nodeId] = execution.output;

    await input.onNodeUpdate?.({
      nodeId,
      nodeType: node.type,
      status: "succeeded",
      outputSnapshot: execution.output,
    });

    const nextEdges = selectNextEdges({
      nodeType: node.type,
      branchResult: execution.branchResult ?? null,
      outgoing: graph.outgoingByNodeId.get(nodeId) ?? [],
    });

    for (const edge of nextEdges) {
      const remaining = (pendingIncoming.get(edge.target) ?? 1) - 1;
      pendingIncoming.set(edge.target, remaining);
      if (remaining === 0) {
        queue.push(edge.target);
      }
    }
  }

  return {
    ok: true,
    context,
    nodeResults,
  };
}

export function getVisualWorkflowGraphIndex(definition: VisualWorkflowDefinition) {
  return buildVisualWorkflowGraphIndex(definition);
}

export type { VisualWorkflowGraphIndex };
