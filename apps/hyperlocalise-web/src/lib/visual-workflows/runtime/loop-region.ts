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
import type { VisualWorkflowGraphIndex } from "./graph-index";

export function incomingEdgesForNode(
  graph: VisualWorkflowGraphIndex,
  nodeId: string,
): CanonicalVisualWorkflowEdge[] {
  const incoming: CanonicalVisualWorkflowEdge[] = [];
  for (const edges of graph.outgoingByNodeId.values()) {
    for (const edge of edges) {
      if (edge.target === nodeId) {
        incoming.push(edge);
      }
    }
  }
  return incoming;
}

export function findForEachLoopRegion(input: {
  graph: VisualWorkflowGraphIndex;
  forEachNodeId: string;
}): {
  bodyNodeIds: string[];
  exitTargetIds: string[];
} {
  const node = input.graph.nodesById.get(input.forEachNodeId);
  return {
    bodyNodeIds: [...(node?.bodyNodeIds ?? [])],
    exitTargetIds: (input.graph.outgoingByNodeId.get(input.forEachNodeId) ?? [])
      .filter((edge) => edge.sourceHandle === "done")
      .map((edge) => edge.target),
  };
}

export function sortLoopBodyNodes(
  graph: VisualWorkflowGraphIndex,
  forEachNodeId: string,
  bodyNodeIds: readonly string[],
): string[] {
  const bodySet = new Set(bodyNodeIds);
  const pending = new Map<string, number>();

  for (const nodeId of bodyNodeIds) {
    const incoming = incomingEdgesForNode(graph, nodeId).filter((edge) => bodySet.has(edge.source));
    pending.set(nodeId, incoming.length);
  }

  const queue = bodyNodeIds.filter((nodeId) => (pending.get(nodeId) ?? 0) === 0);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }
    ordered.push(nodeId);

    for (const edge of graph.outgoingByNodeId.get(nodeId) ?? []) {
      if (!bodySet.has(edge.target)) {
        continue;
      }
      const remaining = (pending.get(edge.target) ?? 1) - 1;
      pending.set(edge.target, remaining);
      if (remaining === 0) {
        queue.push(edge.target);
      }
    }
  }

  return ordered.length === bodyNodeIds.length ? ordered : [...bodyNodeIds];
}
