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
import type { CanonicalVisualWorkflowEdge } from "../schema/types";
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
import { findForEachLoopRegion, incomingEdgesForNode, sortLoopBodyNodes } from "./loop-region";

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

function releasePredecessorEdge(input: {
  pendingIncoming: Map<string, number>;
  queue: string[];
  targetNodeId: string;
}) {
  const remaining = (input.pendingIncoming.get(input.targetNodeId) ?? 1) - 1;
  input.pendingIncoming.set(input.targetNodeId, remaining);
  if (remaining === 0) {
    input.queue.push(input.targetNodeId);
  }
}

function propagateSkippedNode(input: {
  nodeId: string;
  graph: VisualWorkflowGraphIndex;
  completed: Set<string>;
  skipped: Set<string>;
  pendingIncoming: Map<string, number>;
  queue: string[];
}) {
  if (input.completed.has(input.nodeId) || input.skipped.has(input.nodeId)) {
    return;
  }

  input.skipped.add(input.nodeId);

  for (const outEdge of input.graph.outgoingByNodeId.get(input.nodeId) ?? []) {
    releaseSkippedOutgoingEdge({
      edge: outEdge,
      graph: input.graph,
      completed: input.completed,
      skipped: input.skipped,
      pendingIncoming: input.pendingIncoming,
      queue: input.queue,
    });
  }
}

function releaseSkippedOutgoingEdge(input: {
  edge: CanonicalVisualWorkflowEdge;
  graph: VisualWorkflowGraphIndex;
  completed: Set<string>;
  skipped: Set<string>;
  pendingIncoming: Map<string, number>;
  queue: string[];
}) {
  const targetId = input.edge.target;
  const remaining = (input.pendingIncoming.get(targetId) ?? 1) - 1;
  input.pendingIncoming.set(targetId, remaining);

  if (remaining > 0) {
    return;
  }

  if (input.completed.has(targetId) || input.skipped.has(targetId)) {
    return;
  }

  propagateSkippedNode({
    nodeId: targetId,
    graph: input.graph,
    completed: input.completed,
    skipped: input.skipped,
    pendingIncoming: input.pendingIncoming,
    queue: input.queue,
  });
}

type RunNodeResult =
  | { ok: true; branchResult?: boolean; nodeType: string; executedNodeIds?: string[] }
  | { ok: false; error: Record<string, unknown> };

function clearLoopBodyState(input: {
  context: VisualWorkflowExecutionContext;
  nodeResults: Record<string, Record<string, unknown>>;
  bodyNodeIds: readonly string[];
}) {
  for (const bodyNodeId of input.bodyNodeIds) {
    delete input.context.nodes[bodyNodeId];
    delete input.nodeResults[bodyNodeId];
  }
}

async function runScopedSubgraph(input: {
  graph: VisualWorkflowGraphIndex;
  nodeIds: readonly string[];
  runNode: (nodeId: string) => Promise<RunNodeResult>;
  runScopedNode: (nodeId: string) => Promise<RunNodeResult>;
}): Promise<
  | { ok: true; lastCompletedNodeId?: string }
  | { ok: false; failedNodeId: string; error: Record<string, unknown> }
> {
  const scope = new Set(input.nodeIds);
  const pendingIncoming = new Map<string, number>();
  const completed = new Set<string>();
  const skipped = new Set<string>();
  const queue: string[] = [];
  let lastCompletedNodeId: string | undefined;

  for (const nodeId of input.nodeIds) {
    const incomingCount = incomingEdgesForNode(input.graph, nodeId).filter((edge) =>
      scope.has(edge.source),
    ).length;
    pendingIncoming.set(nodeId, incomingCount);
    if (incomingCount === 0) {
      queue.push(nodeId);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || completed.has(nodeId) || skipped.has(nodeId)) {
      continue;
    }
    completed.add(nodeId);

    const execution = await input.runScopedNode(nodeId);
    if (!execution.ok) {
      return { ok: false, failedNodeId: nodeId, error: execution.error };
    }
    lastCompletedNodeId = nodeId;

    const node = input.graph.nodesById.get(nodeId);
    if (!node) {
      continue;
    }

    const outgoing = input.graph.outgoingByNodeId.get(nodeId) ?? [];
    const nextEdges = selectNextEdges({
      nodeType: node.type,
      branchResult: execution.branchResult ?? null,
      outgoing,
    });
    const selectedEdgeIds = new Set(nextEdges.map((edge) => edge.id));

    for (const edge of nextEdges) {
      if (!scope.has(edge.target)) {
        continue;
      }
      releasePredecessorEdge({
        pendingIncoming,
        queue,
        targetNodeId: edge.target,
      });
    }

    if (node.type === "logic.if") {
      for (const edge of outgoing) {
        if (selectedEdgeIds.has(edge.id) || !scope.has(edge.target)) {
          continue;
        }

        releaseSkippedOutgoingEdge({
          edge,
          graph: input.graph,
          completed,
          skipped,
          pendingIncoming,
          queue,
        });
      }
    }
  }

  return { ok: true, lastCompletedNodeId };
}

type ForEachExecutionContext = {
  graph: VisualWorkflowGraphIndex;
  context: VisualWorkflowExecutionContext;
  nodeResults: Record<string, Record<string, unknown>>;
  runNode: (nodeId: string) => Promise<RunNodeResult>;
  executeForEachNode: (forEachNodeId: string) => Promise<RunNodeResult>;
};

async function executeForEachLoop(
  input: ForEachExecutionContext & {
    forEachNodeId: string;
  },
): Promise<RunNodeResult> {
  const execution = await input.runNode(input.forEachNodeId);
  if (!execution.ok) {
    return execution;
  }

  const items = (input.nodeResults[input.forEachNodeId]?.items as unknown[]) ?? [];
  const { bodyNodeIds } = findForEachLoopRegion({
    graph: input.graph,
    forEachNodeId: input.forEachNodeId,
  });
  const orderedBody = sortLoopBodyNodes(input.graph, input.forEachNodeId, bodyNodeIds);
  const iterationOutputs: Record<string, unknown>[] = [];
  const executedNodeIds = new Set<string>();

  for (let index = 0; index < items.length; index += 1) {
    setNodeOutput(input.context, input.forEachNodeId, {
      ...input.nodeResults[input.forEachNodeId],
      item: items[index],
      index,
    });

    clearLoopBodyState({
      context: input.context,
      nodeResults: input.nodeResults,
      bodyNodeIds: orderedBody,
    });

    const bodyResult = await runScopedSubgraph({
      graph: input.graph,
      nodeIds: orderedBody,
      runNode: input.runNode,
      runScopedNode: async (nodeId) => {
        const node = input.graph.nodesById.get(nodeId);
        if (node?.type === "logic.for_each") {
          const nested = await input.executeForEachNode(nodeId);
          if (nested.ok && nested.executedNodeIds) {
            for (const executedNodeId of nested.executedNodeIds) {
              executedNodeIds.add(executedNodeId);
            }
          }
          return nested;
        }

        const result = await input.runNode(nodeId);
        if (result.ok) {
          executedNodeIds.add(nodeId);
        }
        return result;
      },
    });
    if (!bodyResult.ok) {
      return { ok: false, error: bodyResult.error };
    }

    const lastBodyNodeId = bodyResult.lastCompletedNodeId;
    iterationOutputs.push(
      lastBodyNodeId ? (input.nodeResults[lastBodyNodeId] ?? {}) : { item: items[index], index },
    );
  }

  setNodeOutput(input.context, input.forEachNodeId, {
    ...input.nodeResults[input.forEachNodeId],
    iterationOutputs,
  });
  input.nodeResults[input.forEachNodeId] =
    input.context.nodes[input.forEachNodeId] ?? input.nodeResults[input.forEachNodeId] ?? {};

  return {
    ok: true,
    nodeType: "logic.for_each",
    executedNodeIds: [...new Set([input.forEachNodeId, ...executedNodeIds])],
  };
}

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
  const skipped = new Set<string>();
  const pendingIncoming = new Map(graph.incomingCountByNodeId);
  const queue = [graph.triggerNodeId];

  const runNode = async (nodeId: string): Promise<RunNodeResult> => {
    const node = graph.nodesById.get(nodeId);
    if (!node) {
      return { ok: false, error: { message: "Node not found." } };
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
      return { ok: false, error: execution.error };
    }

    setNodeOutput(context, nodeId, execution.output);
    nodeResults[nodeId] = execution.output;

    await input.onNodeUpdate?.({
      nodeId,
      nodeType: node.type,
      status: "succeeded",
      outputSnapshot: execution.output,
    });

    return { ok: true, branchResult: execution.branchResult, nodeType: node.type };
  };

  const forEachContext: ForEachExecutionContext = {
    graph,
    context,
    nodeResults,
    runNode,
    executeForEachNode: async () => ({ ok: false, error: { message: "Loop executor not ready." } }),
  };
  forEachContext.executeForEachNode = async (forEachNodeId) =>
    executeForEachLoop({ ...forEachContext, forEachNodeId });

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || completed.has(nodeId) || skipped.has(nodeId)) {
      continue;
    }
    completed.add(nodeId);

    const node = graph.nodesById.get(nodeId);
    if (!node) {
      continue;
    }

    if (node.type === "logic.for_each") {
      const execution = await executeForEachLoop({ ...forEachContext, forEachNodeId: nodeId });
      if (!execution.ok) {
        return {
          ok: false,
          context,
          nodeResults,
          failedNodeId: nodeId,
          error: execution.error,
        };
      }

      const { exitTargetIds } = findForEachLoopRegion({
        graph,
        forEachNodeId: nodeId,
      });

      for (const executedNodeId of execution.executedNodeIds ?? []) {
        completed.add(executedNodeId);
      }

      for (const exitTargetId of exitTargetIds) {
        if (completed.has(exitTargetId)) {
          continue;
        }
        releasePredecessorEdge({
          pendingIncoming,
          queue,
          targetNodeId: exitTargetId,
        });
      }

      continue;
    }

    const execution = await runNode(nodeId);
    if (!execution.ok) {
      return {
        ok: false,
        context,
        nodeResults,
        failedNodeId: nodeId,
        error: execution.error,
      };
    }

    const outgoing = graph.outgoingByNodeId.get(nodeId) ?? [];
    const nextEdges = selectNextEdges({
      nodeType: node.type,
      branchResult: execution.branchResult ?? null,
      outgoing,
    });
    const selectedEdgeIds = new Set(nextEdges.map((edge) => edge.id));

    for (const edge of nextEdges) {
      releasePredecessorEdge({
        pendingIncoming,
        queue,
        targetNodeId: edge.target,
      });
    }

    if (node.type === "logic.if") {
      for (const edge of outgoing) {
        if (selectedEdgeIds.has(edge.id)) {
          continue;
        }

        releaseSkippedOutgoingEdge({
          edge,
          graph,
          completed,
          skipped,
          pendingIncoming,
          queue,
        });
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
