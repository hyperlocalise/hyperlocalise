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
import type { VisualWorkflowRfEdge, VisualWorkflowV3Edge } from "../schema/types";

export type FlowBodyRegion = {
  bodyNodeIds: string[];
  exitNodeIds: string[];
};

function isExecutionEdge(edge: VisualWorkflowRfEdge): boolean {
  return edge.data?.kind !== "data";
}

function collectReachableNodeIds(
  ownerId: string,
  edges: readonly VisualWorkflowRfEdge[],
  entryHandle: string,
): Set<string> {
  const outgoingByNodeId = new Map<string, string[]>();

  for (const edge of edges) {
    if (!isExecutionEdge(edge) || !edge.source || !edge.target) {
      continue;
    }

    const targets = outgoingByNodeId.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoingByNodeId.set(edge.source, targets);
  }

  const roots = edges
    .filter(
      (edge) =>
        isExecutionEdge(edge) &&
        edge.source === ownerId &&
        edge.sourceHandle === entryHandle &&
        edge.target !== ownerId,
    )
    .map((edge) => edge.target);

  const reachable = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId || nodeId === ownerId || reachable.has(nodeId)) {
      continue;
    }

    reachable.add(nodeId);

    for (const targetId of outgoingByNodeId.get(nodeId) ?? []) {
      if (targetId !== ownerId && !reachable.has(targetId)) {
        queue.push(targetId);
      }
    }
  }

  return reachable;
}

export function deriveForEachLoopRegion(
  loopId: string,
  edges: readonly VisualWorkflowRfEdge[],
): FlowBodyRegion {
  const eachReachable = collectReachableNodeIds(loopId, edges, "each");
  const doneReachable = collectReachableNodeIds(loopId, edges, "done");

  return {
    bodyNodeIds: [...eachReachable].filter((nodeId) => !doneReachable.has(nodeId)).toSorted(),
    exitNodeIds: [...doneReachable].toSorted(),
  };
}

export function computeForEachBodyNodeIds(
  loopId: string,
  edges: readonly VisualWorkflowRfEdge[],
): string[] {
  return deriveForEachLoopRegion(loopId, edges).bodyNodeIds;
}

export function computeForEachBodyNodeIdsFromV3Edges(
  loopId: string,
  edges: readonly VisualWorkflowV3Edge[],
): string[] {
  const editorEdges: VisualWorkflowRfEdge[] = edges
    .filter(
      (edge): edge is Extract<VisualWorkflowV3Edge, { kind: "execution" }> =>
        edge.kind === "execution",
    )
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourcePortId,
      targetHandle: edge.targetPortId,
      data: {
        kind: "execution",
      },
    }));

  return computeForEachBodyNodeIds(loopId, editorEdges);
}

export function computeRetryBodyNodeIds(
  retryId: string,
  edges: readonly VisualWorkflowRfEdge[],
): string[] {
  return [...collectReachableNodeIds(retryId, edges, "attempt")].toSorted();
}
